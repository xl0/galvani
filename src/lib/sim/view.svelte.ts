import { getContext, setContext } from 'svelte';
import type { ColormapName } from '$lib/viz/colormap';

export type Tool = 'probe' | 'paint' | 'cut';

/** Cluster-view display state (what to draw, how, and the active tool). */
export class ViewState {
	/** 'vm' or an ion name */
	field = $state('vm');
	colormap = $state<ColormapName>('viridis');
	autoRange = $state(true);
	min = $state(-80);
	max = $state(0);
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
	/** current display range of the field (written by ClusterView) */
	range = $state<[number, number]>([0, 1]);
}

const KEY = Symbol('galvani-view');
export const setView = (v: ViewState) => setContext(KEY, v);
export const getView = () => getContext<ViewState>(KEY);

export const PROBE_COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324', '#469990', '#bfef45'];
export const PROFILE_COLORS = ['#ff7f0e', '#1f77b4', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2'];
