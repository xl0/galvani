import { getContext, setContext } from 'svelte';
import type { ColormapName } from '$lib/viz/colormap';

export type Tool = 'probe' | 'paint' | 'cut';

/** Cluster-view display state (what to draw, how, and the active tool). */
export interface RangeSetting { mode: 'frame' | 'run' | 'fixed'; min: number; max: number }

export class ViewState {
	/** 'vm' or an ion name */
	field = $state('vm');
	colormap = $state<ColormapName>('viridis');
	/** colour range per field: 'frame' = min/max of the displayed frame, 'run' = min/max over the run so far,
	 *  'fixed' = the stored min/max */
	ranges = $state<Record<string, RangeSetting>>({});
	get rangeSetting(): RangeSetting { return this.ranges[this.field] ?? { mode: 'run', min: -80, max: 0 }; }
	setRange(patch: Partial<RangeSetting>): void { this.ranges = { ...this.ranges, [this.field]: { ...this.rangeSetting, ...patch } }; }
	tool = $state<Tool>('probe');
	/** profile id painted by the paint tool */
	activeProfile = $state<string | null>(null);
	/** brush radius in cell radii */
	brush = $state(1.5);
	showMembranes = $state(false);
	zoom = $state(1);
	panX = $state(0);
	panY = $state(0);
	hover = $state<number | null>(null);
	/** hovered time in the trace panel [s], shared across all trace charts */
	traceHoverT = $state<number | null>(null);
	/** visible time window of the trace panel [s], or null for the whole run */
	traceRange = $state<[number, number] | null>(null);
	/** current display range of the field (written by ClusterView) */
	range = $state<[number, number]>([0, 1]);
	/** quantities plotted in the trace panel: 'vm' or ion names */
	traceQuantities = $state<string[]>(['vm', 'Na', 'K']);
	/** Persist UI preferences in localStorage; call once from the workbench on mount. */
	persist(): void {
		const raw = localStorage.getItem('galvani:view');
		if (raw) { const v = JSON.parse(raw); this.traceQuantities = v.traceQuantities ?? this.traceQuantities; this.ranges = v.ranges ?? {}; }
		$effect(() => localStorage.setItem('galvani:view', JSON.stringify({ traceQuantities: this.traceQuantities, ranges: this.ranges })));
	}
}

const KEY = Symbol('galvani-view');
export const setView = (v: ViewState) => setContext(KEY, v);
export const getView = () => getContext<ViewState>(KEY);

export const PROFILE_COLORS = ['#ff7f0e', '#1f77b4', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2'];
