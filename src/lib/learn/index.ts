import type { Component } from 'svelte';
import Nernst from './chapters/Nernst.svelte';
import Leak from './chapters/Leak.svelte';
import Pump from './chapters/Pump.svelte';
import Charge from './chapters/Charge.svelte';
import Gates from './chapters/Gates.svelte';
import Junction from './chapters/Junction.svelte';
import Tissue from './chapters/Tissue.svelte';

export interface Chapter { slug: string; title: string; short: string; component: Component }

export const chapters: Chapter[] = [
	{ slug: 'ions', title: 'Ions, gradients and the Nernst voltage', short: 'Ions & gradients', component: Nernst },
	{ slug: 'leak', title: 'A leaky membrane: the GHK voltage', short: 'Leaky membrane', component: Leak },
	{ slug: 'pump', title: 'The pump', short: 'The pump', component: Pump },
	{ slug: 'charge', title: 'Voltage from charge', short: 'Voltage from charge', component: Charge },
	{ slug: 'gates', title: 'Gates: how a cell fires', short: 'Gates', component: Gates },
	{ slug: 'junction', title: 'Two cells and a gap junction', short: 'Gap junctions', component: Junction },
	{ slug: 'tissue', title: 'A tissue: waves and regions', short: 'Tissue', component: Tissue }
];
