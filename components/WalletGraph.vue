<template>
    <div ref="containerRef" class="wallet-graph" @mousemove="onMouseMove" @mouseleave="hideTooltip">
        <svg ref="svgRef" :width="width" :height="height" />
        <div
            v-if="tooltip.visible"
            class="graph-tooltip"
            :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
        >
            <div class="tooltip-address">{{ tooltip.address }}</div>
            <div v-if="tooltip.name" class="tooltip-name">{{ tooltip.name }}</div>
            <div v-if="tooltip.labels" class="tooltip-labels">{{ tooltip.labels }}</div>
            <div class="tooltip-stats">
                <span>{{ tooltip.txCount }} transactions</span>
                <span v-if="tooltip.outCount" class="stat-out">{{ tooltip.outCount }} out</span>
                <span v-if="tooltip.inCount" class="stat-in">{{ tooltip.inCount }} in</span>
            </div>
            <div v-if="!tooltip.isCenter" class="tooltip-hint">Click to explore</div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import * as d3 from 'd3';
    import type { WalletGraphResponse } from '~/server/api/wallet/[address].get';

    interface GraphNode extends d3.SimulationNodeDatum {
        id: string;
        address: string;
        name: string | null;
        labels: string | null;
        isCenter: boolean;
        txCount: number;
        outCount: number;
        inCount: number;
        radius: number;
    }

    interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
        source: GraphNode;
        target: GraphNode;
    }

    const props = defineProps<{
        data: WalletGraphResponse;
    }>();

    const emit = defineEmits<{
        selectWallet: [address: string];
    }>();

    const containerRef = ref<HTMLElement>();
    const svgRef = ref<SVGSVGElement>();
    const width = ref(800);
    const height = ref(600);

    const tooltip = reactive({
        visible: false,
        x: 0,
        y: 0,
        address: '',
        name: null as string | null,
        labels: null as string | null,
        txCount: 0,
        outCount: 0,
        inCount: 0,
        isCenter: false,
    });

    let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;
    let hoveredNode: GraphNode | null = null;

    function truncateAddress(addr: string): string {
        if (!addr || addr.length < 12) return addr;
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    }

    function nodeColor(node: GraphNode): string {
        if (node.isCenter) return '#6b7280';
        const total = node.outCount + node.inCount;
        if (total === 0) return '#6b7280';
        const ratio = node.inCount / total;
        const r = Math.round(239 * (1 - ratio) + 63 * ratio);
        const g = Math.round(68 * (1 - ratio) + 234 * ratio);
        const b = Math.round(68 * (1 - ratio) + 0 * ratio);
        return `rgb(${r},${g},${b})`;
    }

    function buildGraph(data: WalletGraphResponse) {
        if (!svgRef.value || !containerRef.value) return;

        const rect = containerRef.value.getBoundingClientRect();
        width.value = rect.width || 800;
        height.value = rect.height || 600;

        const svg = d3.select(svgRef.value);
        svg.selectAll('*').remove();

        if (simulation) {
            simulation.stop();
            simulation = null;
        }

        const maxTx = Math.max(1, ...data.connections.map((c) => c.txCount));

        const nodes: GraphNode[] = [
            {
                id: data.center.neid,
                address: data.center.address,
                name: data.center.name,
                labels: data.center.labels,
                isCenter: true,
                txCount: data.connections.reduce((sum, c) => sum + c.txCount, 0),
                outCount: data.connections.reduce((sum, c) => sum + c.outCount, 0),
                inCount: data.connections.reduce((sum, c) => sum + c.inCount, 0),
                radius: 32,
                fx: width.value / 2,
                fy: height.value / 2,
            },
            ...data.connections.map((c) => ({
                id: c.neid,
                address: c.address,
                name: c.name,
                labels: c.labels,
                isCenter: false,
                txCount: c.txCount,
                outCount: c.outCount,
                inCount: c.inCount,
                radius: 14 + (c.txCount / maxTx) * 30,
            })),
        ];

        const links: GraphLink[] = data.connections.map((c) => ({
            source: nodes[0],
            target: nodes.find((n) => n.id === c.neid)!,
        }));

        const defs = svg.append('defs');
        defs.append('filter')
            .attr('id', 'glow')
            .append('feGaussianBlur')
            .attr('stdDeviation', '3')
            .attr('result', 'coloredBlur');
        const feMerge = defs.select('filter').append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        const g = svg.append('g');

        const linkGroup = g
            .selectAll<SVGLineElement, GraphLink>('line')
            .data(links)
            .join('line')
            .attr('stroke', 'rgba(255,255,255,0.12)')
            .attr('stroke-width', 1.5);

        const nodeGroup = g
            .selectAll<SVGGElement, GraphNode>('g.node')
            .data(nodes)
            .join('g')
            .attr('class', 'node')
            .style('cursor', (d) => (d.isCenter ? 'default' : 'pointer'))
            .on('click', (_event, d) => {
                if (!d.isCenter && d.address) {
                    emit('selectWallet', d.address);
                }
            })
            .on('mouseenter', (_event, d) => {
                hoveredNode = d;
            })
            .on('mouseleave', () => {
                hoveredNode = null;
                hideTooltip();
            });

        nodeGroup
            .append('circle')
            .attr('r', (d) => d.radius)
            .attr('fill', (d) => nodeColor(d))
            .attr('fill-opacity', 0.85)
            .attr('stroke', (d) => (d.isCenter ? 'rgba(255,255,255,0.3)' : nodeColor(d)))
            .attr('stroke-width', (d) => (d.isCenter ? 2 : 1))
            .attr('filter', 'url(#glow)');

        nodeGroup
            .append('text')
            .text((d) => d.name || truncateAddress(d.address))
            .attr('text-anchor', 'middle')
            .attr('dy', (d) => d.radius + 16)
            .attr('fill', 'rgba(255,255,255,0.7)')
            .attr('font-size', '11px')
            .attr('font-family', 'var(--font-mono, monospace)');

        simulation = d3
            .forceSimulation<GraphNode>(nodes)
            .force(
                'link',
                d3
                    .forceLink<GraphNode, GraphLink>(links)
                    .id((d) => d.id)
                    .distance(160)
            )
            .force('charge', d3.forceManyBody().strength(-300))
            .force(
                'collision',
                d3.forceCollide<GraphNode>().radius((d) => d.radius + 10)
            )
            .on('tick', () => {
                linkGroup
                    .attr('x1', (d) => (d.source as GraphNode).x!)
                    .attr('y1', (d) => (d.source as GraphNode).y!)
                    .attr('x2', (d) => (d.target as GraphNode).x!)
                    .attr('y2', (d) => (d.target as GraphNode).y!);

                nodeGroup.attr('transform', (d) => `translate(${d.x},${d.y})`);
            });

        const drag = d3
            .drag<SVGGElement, GraphNode>()
            .on('start', (event, d) => {
                if (!event.active) simulation!.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) simulation!.alphaTarget(0);
                if (!d.isCenter) {
                    d.fx = null;
                    d.fy = null;
                }
            });

        nodeGroup.call(drag);

        const zoom = d3
            .zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.3, 3])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);
        svg.call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(1));
    }

    function onMouseMove(event: MouseEvent) {
        if (!hoveredNode) return;
        tooltip.visible = true;
        tooltip.x = event.clientX + 12;
        tooltip.y = event.clientY - 10;
        tooltip.address = hoveredNode.address;
        tooltip.name = hoveredNode.name;
        tooltip.labels = hoveredNode.labels;
        tooltip.txCount = hoveredNode.txCount;
        tooltip.outCount = hoveredNode.outCount;
        tooltip.inCount = hoveredNode.inCount;
        tooltip.isCenter = hoveredNode.isCenter;
    }

    function hideTooltip() {
        if (!hoveredNode) tooltip.visible = false;
    }

    let resizeObserver: ResizeObserver | null = null;

    watch(
        () => props.data,
        (data) => {
            if (data) nextTick(() => buildGraph(data));
        },
        { immediate: true }
    );

    onMounted(() => {
        if (containerRef.value) {
            resizeObserver = new ResizeObserver(() => {
                if (props.data) buildGraph(props.data);
            });
            resizeObserver.observe(containerRef.value);
        }
    });

    onBeforeUnmount(() => {
        resizeObserver?.disconnect();
        simulation?.stop();
    });
</script>

<style scoped>
    .wallet-graph {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
    }

    .wallet-graph svg {
        display: block;
        width: 100%;
        height: 100%;
    }

    .graph-tooltip {
        position: fixed;
        z-index: 100;
        background: rgba(20, 20, 20, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        padding: 10px 14px;
        pointer-events: none;
        max-width: 360px;
        font-size: 12px;
    }

    .tooltip-address {
        font-family: var(--font-mono, monospace);
        font-size: 11px;
        color: rgba(255, 255, 255, 0.6);
        word-break: break-all;
    }

    .tooltip-name {
        font-weight: 600;
        color: #e5e5e5;
        margin-top: 2px;
    }

    .tooltip-labels {
        color: rgba(255, 255, 255, 0.5);
        font-size: 11px;
        margin-top: 2px;
    }

    .tooltip-stats {
        margin-top: 6px;
        display: flex;
        gap: 10px;
        color: rgba(255, 255, 255, 0.8);
    }

    .stat-out {
        color: #ef4444;
    }

    .stat-in {
        color: #3fea00;
    }

    .tooltip-hint {
        margin-top: 4px;
        color: rgba(255, 255, 255, 0.35);
        font-size: 10px;
    }
</style>
