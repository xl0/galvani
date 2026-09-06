import { Muxer, ArrayBufferTarget } from 'webm-muxer';
import type { SimSession } from './sim/session.svelte';
import type { ColormapName } from './viz/colormap';
import { drawCluster, drawColorbar, drawTraceStrip } from './viz/render';
import { extentOf, fieldLabel, fieldUnit, fieldValues } from './viz/fields';

export interface VideoOptions {
	/** display fields, one panel each */
	fields: string[];
	/** trace quantities ('vm', ion names, 'S:<sub>') drawn as strips under the panels */
	traces: string[];
	/** simulated seconds per second of video */
	speed: number;
	fps: number;
	/** frame width in pixels (height follows the layout) */
	width: number;
	colormap: ColormapName;
	/** 'run' = colour range over all recorded frames; 'frame' = per frame */
	rangeMode: 'run' | 'frame';
	dark: boolean;
}

/** Render the recorded frames into a WebM (VP9 via WebCodecs). Returns the file; `onProgress` gets 0..1. */
export async function renderVideo(session: SimSession, o: VideoOptions, onProgress: (f: number) => void): Promise<Blob> {
	if (typeof VideoEncoder === 'undefined') throw new Error('This browser has no WebCodecs (VideoEncoder); use Chrome, Edge, Safari 16.4+ or Firefox 130+.');
	const hist = session.history, geom = session.geom;
	if (!geom || hist.length < 2) throw new Error('Nothing recorded yet: run the experiment first.');
	const ions = session.experiment.ions, profiles = session.experiment.profiles;
	const t0 = hist[0].t, t1 = hist[hist.length - 1].t;
	const nFrames = Math.max(2, Math.ceil(((t1 - t0) / o.speed) * o.fps));
	// layout: panels in a row (wrap to two rows past 3), each with a colour bar; trace strips below
	const nP = o.fields.length, cols = Math.min(nP, 3), rows = Math.ceil(nP / cols);
	const panelW = Math.floor(o.width / Math.max(1, cols)), panelH = Math.round(panelW * 0.8), barH = 34, stripH = 110;
	const width = o.width, height = rows * (panelH + barH) + o.traces.length * stripH + 24;
	if (width % 2 || height % 2) throw new Error('internal: frame size must be even');
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d')!;
	const fg = o.dark ? '#e5e5e5' : '#18181b', bg = o.dark ? '#0a0a0a' : '#fafafa', border = o.dark ? '#3f3f46' : '#d4d4d8', muted = o.dark ? '#27272a' : '#e4e4e7', grid = o.dark ? '#3f3f46' : '#d4d4d8';
	// colour ranges
	const ranges = o.fields.map((f) => {
		if (o.rangeMode === 'frame') return null;
		let lo = Infinity, hi = -Infinity;
		for (const s of hist) [lo, hi] = extentOf(fieldValues(s, geom, ions, f, false), lo, hi);
		if (!(hi > lo)) hi = lo + 1e-9;
		return [lo, hi] as [number, number];
	});
	// trace series from the session's traces (per probe), on the full time base
	const tr = session.traceT, tRange: [number, number] = [tr[0] ?? t0, tr[tr.length - 1] ?? t1];
	const traceSeries = o.traces.map((q) => {
		const ii = ions.findIndex((x) => x.name === q), si = session.subNames.indexOf(q.startsWith('S:') ? q.slice(2) : '');
		const series: { color: string; y: (number | null)[]; dash?: number[] }[] = session.probes.map((c) => { const t = session.traces.get(c); const y = !t ? [] : q === 'vm' ? t.vm.map((v) => (v === null ? null : v * 1e3)) : si >= 0 ? (t.sub[si] ?? []) : (t.cc[ii] ?? []); return { color: session.probeColors[c] ?? '#888', y }; });
		if (session.bathProbe && ii >= 0) series.push({ color: session.bathColor, y: session.traceBath[ii] ?? [], dash: [5, 3] });
		return { label: `${fieldLabel(q, hist[0])} (${fieldUnit(q)})`, series };
	});
	const target = new ArrayBufferTarget();
	const muxer = new Muxer({ target, video: { codec: 'V_VP9', width, height, frameRate: o.fps } });
	const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { throw e; } });
	encoder.configure({ codec: 'vp09.00.10.08', width, height, bitrate: 6e6, framerate: o.fps });
	let hi = 0;
	for (let k = 0; k < nFrames; k++) {
		const t = t0 + (k * o.speed) / o.fps;
		while (hi + 1 < hist.length && hist[hi + 1].t <= t) hi++;
		const s = hist[hi];
		ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
		o.fields.forEach((f, i) => {
			const px = (i % cols) * panelW, py = Math.floor(i / cols) * (panelH + barH);
			const range = ranges[i] ?? (() => { let [lo, h2] = extentOf(fieldValues(s, geom, ions, f, false)); if (!(h2 > lo)) h2 = lo + 1e-9; return [lo, h2] as [number, number]; })();
			ctx.save(); ctx.translate(px, py); ctx.beginPath(); ctx.rect(0, 0, panelW, panelH); ctx.clip();
			drawCluster(ctx, geom, s, ions, profiles, panelW, panelH, { colormap: o.colormap, range, field: f, showMembranes: false, border, muted, foreground: fg });
			ctx.restore();
			drawColorbar(ctx, px + 40, py + panelH + 14, panelW - 80, 8, o.colormap, range, `${fieldLabel(f, s)} (${fieldUnit(f)})`, fg);
		});
		traceSeries.forEach((ts, j) => drawTraceStrip(ctx, 0, rows * (panelH + barH) + j * stripH, width, stripH, tr, ts.series, tRange, s.t, ts.label, fg, grid));
		ctx.fillStyle = fg; ctx.font = '12px ui-monospace, monospace'; ctx.textAlign = 'left';
		ctx.fillText(`t = ${s.t.toFixed(3)} s`, 8, height - 8);
		ctx.textAlign = 'right'; ctx.fillText(session.experiment.name, width - 8, height - 8);
		const frame = new VideoFrame(canvas, { timestamp: Math.round((k * 1e6) / o.fps), duration: Math.round(1e6 / o.fps) });
		encoder.encode(frame, { keyFrame: k % (o.fps * 2) === 0 });
		frame.close();
		if (k % 10 === 0) { onProgress(k / nFrames); await new Promise((r) => setTimeout(r, 0)); }
	}
	await encoder.flush();
	encoder.close();
	muxer.finalize();
	onProgress(1);
	return new Blob([target.buffer], { type: 'video/webm' });
}

export function downloadBlob(name: string, blob: Blob): void {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
