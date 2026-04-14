<template>
    <div ref="containerRef" class="eth-graph-container">
        <svg ref="svgRef" class="eth-graph-svg" />

        <Transition name="tooltip-fade">
            <div
                v-if="hoveredNode && !hoveredNode.isCenter"
                class="node-tooltip"
                :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }"
            >
                <div class="tooltip-address font-mono">{{ hoveredNode.id }}</div>
                <div class="tooltip-row">
                    <span class="tooltip-label">Transactions</span>
                    <span class="tooltip-value">{{ hoveredNode.txCount }}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">Received</span>
                    <span class="tooltip-value text-green"
                        >{{ formatEth(hoveredNode.totalInEth) }} ETH</span
                    >
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">Sent</span>
                    <span class="tooltip-value text-orange"
                        >{{ formatEth(hoveredNode.totalOutEth) }} ETH</span
                    >
                </div>
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
    import * as d3 from 'd3';
    import type { GraphNode, GraphLink } from '~/types/eth';

    interface SimNode extends GraphNode, d3.SimulationNodeDatum {}
    interface SimLink extends d3.SimulationLinkDatum<SimNode> {
        txCount: number;
    }

    const props = defineProps<{
        nodes: GraphNode[];
        links: GraphLink[];
    }>();

    const emit = defineEmits<{
        nodeClick: [address: string];
    }>();

    const containerRef = ref<HTMLElement | null>(null);
    const svgRef = ref<SVGSVGElement | null>(null);
    const hoveredNode = ref<GraphNode | null>(null);
    const tooltipPos = ref({ x: 0, y: 0 });

    let simulation: d3.Simulation<SimNode, SimLink> | null = null;
    let resizeObserver: ResizeObserver | null = null;

    function formatEth(value: number): string {
        if (value === 0) return '0';
        if (value < 0.0001) return '< 0.0001';
        if (value < 1) return value.toFixed(4);
        if (value < 1000) return value.toFixed(2);
        return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    function getNodeRadius(node: GraphNode, maxTxCount: number): number {
        if (node.isCenter) return 30;
        const min = 12;
        const max = 28;
        const ratio = maxTxCount > 0 ? node.txCount / maxTxCount : 0;
        return min + ratio * (max - min);
    }

    function getNodeColor(node: GraphNode): string {
        if (node.isCenter) return '#757575';
        const total = node.totalInEth + node.totalOutEth;
        if (total === 0) return '#757575';
        const ratio = node.totalInEth / total;
        const r = Math.round(239 * (1 - ratio) + 63 * ratio);
        const g = Math.round(68 * (1 - ratio) + 234 * ratio);
        const b = Math.round(68 * (1 - ratio));
        return `rgb(${r}, ${g}, ${b})`;
    }

    function renderGraph() {
        const svg = svgRef.value;
        const container = containerRef.value;
        if (!svg || !container || props.nodes.length === 0) return;

        const { width, height } = container.getBoundingClientRect();
        if (width === 0 || height === 0) return;

        d3.select(svg).selectAll('*').remove();

        if (simulation) {
            simulation.stop();
            simulation = null;
        }

        const simNodes: SimNode[] = props.nodes.map((n) => ({ ...n }));
        const simLinks: SimLink[] = props.links.map((l) => ({
            source: typeof l.source === 'string' ? l.source : l.source.id,
            target: typeof l.target === 'string' ? l.target : l.target.id,
            txCount: l.txCount,
        }));

        const maxTxCount = Math.max(
            ...simNodes.filter((n) => !n.isCenter).map((n) => n.txCount),
            1
        );

        const centerNode = simNodes.find((n) => n.isCenter);
        if (centerNode) {
            centerNode.fx = width / 2;
            centerNode.fy = height / 2;
        }

        const svgSel = d3
            .select(svg)
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`);

        const defs = svgSel.append('defs');

        const glow = defs.append('filter').attr('id', 'glow');
        glow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
        const feMerge = glow.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'blur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        const g = svgSel.append('g');

        const zoom = d3
            .zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.3, 3])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svgSel.call(zoom);

        const linkGroup = g
            .append('g')
            .selectAll<SVGLineElement, SimLink>('line')
            .data(simLinks)
            .join('line')
            .attr('stroke', '#2A2A2A')
            .attr('stroke-width', (d) => Math.max(1, Math.min(4, (d.txCount / maxTxCount) * 3 + 1)))
            .attr('stroke-opacity', 0.6);

        const nodeGroup = g
            .append('g')
            .selectAll<SVGGElement, SimNode>('g')
            .data(simNodes)
            .join('g')
            .attr('cursor', (d) => (d.isCenter ? 'default' : 'pointer'))
            .on('click', (_event, d) => {
                if (!d.isCenter) {
                    emit('nodeClick', d.id);
                }
            })
            .on('mouseenter', (event, d) => {
                if (!d.isCenter) {
                    hoveredNode.value = d;
                    const rect = container.getBoundingClientRect();
                    tooltipPos.value = {
                        x: event.clientX - rect.left + 12,
                        y: event.clientY - rect.top - 12,
                    };
                }
            })
            .on('mousemove', (event) => {
                if (hoveredNode.value) {
                    const rect = container.getBoundingClientRect();
                    tooltipPos.value = {
                        x: event.clientX - rect.left + 12,
                        y: event.clientY - rect.top - 12,
                    };
                }
            })
            .on('mouseleave', () => {
                hoveredNode.value = null;
            });

        nodeGroup
            .append('circle')
            .attr('r', (d) => getNodeRadius(d, maxTxCount))
            .attr('fill', (d) => getNodeColor(d))
            .attr('fill-opacity', 0.85)
            .attr('stroke', (d) => (d.isCenter ? '#A0AEC0' : getNodeColor(d)))
            .attr('stroke-width', (d) => (d.isCenter ? 2 : 1.5))
            .attr('stroke-opacity', (d) => (d.isCenter ? 0.5 : 0.3))
            .attr('filter', 'url(#glow)');

        nodeGroup
            .append('text')
            .text((d) => d.label)
            .attr('text-anchor', 'middle')
            .attr('dy', (d) => getNodeRadius(d, maxTxCount) + 14)
            .attr('fill', '#A0AEC0')
            .attr('font-size', '10px')
            .attr('font-family', 'var(--font-mono)')
            .attr('pointer-events', 'none');

        const drag = d3
            .drag<SVGGElement, SimNode>()
            .on('start', (event, d) => {
                if (!event.active) simulation?.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) simulation?.alphaTarget(0);
                if (!d.isCenter) {
                    d.fx = null;
                    d.fy = null;
                }
            });

        nodeGroup.call(drag);

        simulation = d3
            .forceSimulation<SimNode>(simNodes)
            .force(
                'link',
                d3
                    .forceLink<SimNode, SimLink>(simLinks)
                    .id((d) => d.id)
                    .distance(140)
            )
            .force('charge', d3.forceManyBody().strength(-400))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force(
                'collision',
                d3.forceCollide<SimNode>().radius((d) => getNodeRadius(d, maxTxCount) + 8)
            )
            .on('tick', () => {
                linkGroup
                    .attr('x1', (d) => (d.source as SimNode).x ?? 0)
                    .attr('y1', (d) => (d.source as SimNode).y ?? 0)
                    .attr('x2', (d) => (d.target as SimNode).x ?? 0)
                    .attr('y2', (d) => (d.target as SimNode).y ?? 0);

                nodeGroup.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
            });
    }

    watch(
        () => [props.nodes, props.links],
        () => {
            nextTick(() => renderGraph());
        },
        { deep: true }
    );

    onMounted(() => {
        resizeObserver = new ResizeObserver(() => {
            renderGraph();
        });
        if (containerRef.value) {
            resizeObserver.observe(containerRef.value);
        }
        renderGraph();
    });

    onUnmounted(() => {
        if (simulation) {
            simulation.stop();
            simulation = null;
        }
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
    });
</script>

<style scoped>
    .eth-graph-container {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        border-radius: 8px;
        background: var(--lv-black);
        background-image: radial-gradient(circle, rgba(117, 117, 117, 0.05) 1px, transparent 1px);
        background-size: 24px 24px;
    }

    .eth-graph-svg {
        display: block;
        width: 100%;
        height: 100%;
    }

    .node-tooltip {
        position: absolute;
        z-index: 10;
        background: var(--lv-surface);
        border: 1px solid var(--lv-surface-light);
        border-radius: 8px;
        padding: 12px 14px;
        pointer-events: none;
        min-width: 220px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }

    .tooltip-address {
        font-size: 0.7rem;
        color: var(--lv-silver);
        margin-bottom: 8px;
        word-break: break-all;
    }

    .tooltip-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 2px 0;
    }

    .tooltip-label {
        color: var(--lv-silver);
        font-size: 0.8rem;
    }

    .tooltip-value {
        font-family: var(--font-mono);
        font-size: 0.8rem;
        color: var(--lv-white);
    }

    .tooltip-fade-enter-active,
    .tooltip-fade-leave-active {
        transition: opacity 0.15s ease;
    }

    .tooltip-fade-enter-from,
    .tooltip-fade-leave-to {
        opacity: 0;
    }
</style>
