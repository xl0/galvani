import { Muxer, ArrayBufferTarget } from 'webm-muxer';
import type { SimSession } from './sim/session.svelte';
import type { ColormapName } from './viz/colormap';
import { clusterTransform, drawCluster, drawColorbar, drawProbes, drawTraceStrip } from './viz/render';
import { extentOf, fieldLabel, fieldUnit, fieldValues } from './viz/fields';
import dbg from 'debug';

const debug = dbg('galvani:video');

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
	/** trace time window [s]; 0 = whole run. Starts at t0 and rolls once the clock passes it. */
	window: number;
	/** VP9 quantizer 0 (lossless-ish) .. 63; constant quality, so static frames cost almost nothing */
	quantizer: number;
	/** frames kept queued in the encoder */
	queue?: number;
	latencyMode?: 'quality' | 'realtime';
	hardwareAcceleration?: 'no-preference' | 'prefer-hardware' | 'prefer-software';
	dark: boolean;
}

/** Render the recorded frames into a WebM (VP9 via WebCodecs). Returns the file; `onProgress` gets 0..1. */
export async function renderVideo(session: SimSession, o: VideoOptions, onProgress: (f: number) => void, signal?: AbortSignal): Promise<Blob> {
	if (typeof VideoEncoder === 'undefined') throw new Error('This browser has no WebCodecs (VideoEncoder); use Chrome, Edge, Safari 16.4+ or Firefox 130+.');
	const hist = session.history, geom = session.geom;
	if (!geom || hist.length < 2) throw new Error('Nothing recorded yet: run the experiment first.');
	const ions = session.experiment.ions, profiles = session.experiment.profiles;
	const t0 = hist[0].t, t1 = hist[hist.length - 1].t;
	const nFrames = Math.max(2, Math.ceil(((t1 - t0) / o.speed) * o.fps));
	// layout: a grid of cells (1-3 → one row, 4 → 2×2, more → 3 per row). The traces count as one item:
	// with an even item count they take the last grid cell (strips stacked), otherwise a full-width block below.
	const nP = o.fields.length, nT = o.traces.length, nItems = nP + (nT ? 1 : 0);
	const cols = nItems <= 3 ? nItems : nItems === 4 ? 2 : 3, rows = Math.ceil(nP / cols);
	const tracesInGrid = nT > 0 && nItems % 2 === 0 && rows * cols === nItems;
	const panelW = Math.floor(o.width / Math.max(1, cols)), panelH = Math.round(panelW * 0.8), barH = 34, cellH = panelH + barH;
	const stripH = tracesInGrid ? Math.floor(cellH / nT) : 110;
	let height = rows * cellH + (tracesInGrid ? 0 : nT * stripH) + 24;
	height += height % 2;
	const width = o.width;
	debug('render %d frames, %dx%d, %d fields + %d traces (%s), history %d frames %s..%s s', nFrames, width, height, nP, nT, tracesInGrid ? 'grid' : 'below', hist.length, t0, t1);
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	// field panels are redrawn only when the snapshot changes (slow speeds repeat one snapshot for many frames)
	const panels = new OffscreenCanvas(width, rows * cellH), pctx = panels.getContext('2d', { willReadFrequently: true })!;
	let drawnHi = -1;
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
	const tr = session.traceT, full: [number, number] = [tr[0] ?? t0, tr[tr.length - 1] ?? t1];
	const tRangeAt = (t: number): [number, number] => !o.window ? full : t - full[0] < o.window ? [full[0], full[0] + o.window] : [t - o.window, t];
	const traceSeries = o.traces.map((q) => {
		const ii = ions.findIndex((x) => x.name === q), si = session.extraNames.indexOf(q);
		const series: { color: string; y: (number | null)[]; dash?: number[] }[] = session.probes.map((c) => { const t = session.traces.get(c); const y = !t ? [] : q === 'vm' ? t.vm.map((v) => (v === null ? null : v * 1e3)) : si >= 0 ? (t.extra[si] ?? []) : (t.cc[ii] ?? []); return { color: session.probeColors[c] ?? '#888', y }; });
		if (session.bathProbe && ii >= 0) series.push({ color: session.bathColor, y: session.traceBath[ii] ?? [], dash: [5, 3] });
		return { label: `${fieldLabel(q, hist[0])} (${fieldUnit(q)})`, series };
	});
	const target = new ArrayBufferTarget();
	const muxer = new Muxer({ target, video: { codec: 'V_VP9', width, height, frameRate: o.fps } });
	let encoded = 0, failure: Error | null = null;
	const encoder = new VideoEncoder({ output: (chunk, meta) => { muxer.addVideoChunk(chunk, meta); encoded++; }, error: (e) => { debug('encoder error %o', e); failure = e; } });
	const config: VideoEncoderConfig = { codec: 'vp09.00.10.08', width, height, framerate: o.fps, bitrateMode: 'quantizer', latencyMode: o.latencyMode ?? 'quality', hardwareAcceleration: o.hardwareAcceleration ?? 'no-preference' };
	const { supported } = await VideoEncoder.isConfigSupported(config);
	if (!supported) throw new Error('VP9 in quantizer (constant quality) mode is not supported by this browser');
	encoder.configure(config);
	// back-pressure: keep at most a few frames queued in the encoder, progress follows what it has emitted
	const drain = (max: number) => new Promise<void>((r) => { const check = () => { if (failure || encoder.encodeQueueSize <= max) { encoder.removeEventListener('dequeue', check); r(); } }; encoder.addEventListener('dequeue', check); check(); });
	let hi = 0, tDraw = 0, tWait = 0, tSubmit = 0;
	const tStart = performance.now();
	for (let k = 0; k < nFrames; k++) {
		const t = t0 + (k * o.speed) / o.fps;
		while (hi + 1 < hist.length && hist[hi + 1].t <= t) hi++;
		const s = hist[hi];
		const tA = performance.now();
		ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
		if (drawnHi !== hi) {
			drawnHi = hi;
			pctx.fillStyle = bg; pctx.fillRect(0, 0, width, rows * cellH);
			o.fields.forEach((f, i) => {
				const px = (i % cols) * panelW, py = Math.floor(i / cols) * cellH;
				const range = ranges[i] ?? (() => { let [lo, h2] = extentOf(fieldValues(s, geom, ions, f, false)); if (!(h2 > lo)) h2 = lo + 1e-9; return [lo, h2] as [number, number]; })();
				pctx.save(); pctx.translate(px, py); pctx.beginPath(); pctx.rect(0, 0, panelW, panelH); pctx.clip();
				drawCluster(pctx, geom, s, ions, profiles, panelW, panelH, { colormap: o.colormap, range, field: f, showMembranes: false, border, muted, foreground: fg });
				if (nT) drawProbes(pctx, geom, session.probes, session.probeColors, clusterTransform(geom, panelW, panelH), fg);
				pctx.restore();
				drawColorbar(pctx, px + 40, py + panelH + 14, panelW - 80, 8, o.colormap, range, `${fieldLabel(f, s)} (${fieldUnit(f)})`, fg);
			});
		}
		ctx.drawImage(panels, 0, 0);
		const tx = tracesInGrid ? (nP % cols) * panelW : 0, ty = tracesInGrid ? Math.floor(nP / cols) * cellH : rows * cellH, tw = tracesInGrid ? panelW : width;
		const tRange = tRangeAt(s.t);
		traceSeries.forEach((ts, j) => drawTraceStrip(ctx, tx, ty + j * stripH, tw, stripH, tr, ts.series, tRange, s.t, ts.label, fg, grid));
		ctx.fillStyle = fg; ctx.font = '12px ui-monospace, monospace'; ctx.textAlign = 'left';
		ctx.fillText(`t = ${s.t.toFixed(3)} s`, 8, height - 8);
		ctx.textAlign = 'right'; ctx.fillText(session.experiment.name, width - 8, height - 8);
		const tS = performance.now();
		const frame = new VideoFrame(canvas, { timestamp: Math.round((k * 1e6) / o.fps), duration: Math.round(1e6 / o.fps) });
		encoder.encode(frame, { keyFrame: k % (o.fps * 2) === 0, vp9: { quantizer: o.quantizer } } as VideoEncoderEncodeOptions);
		frame.close();
		const tB = performance.now(); tDraw += tS - tA; tSubmit += tB - tS;
		await drain(o.queue ?? 8);
		tWait += performance.now() - tB;
		if (failure) throw failure;
		if (signal?.aborted) { encoder.close(); debug('cancelled at frame %d', k); throw new DOMException('Export cancelled', 'AbortError'); }
		if (k % 10 === 0) { onProgress(encoded / nFrames); await new Promise((r) => setTimeout(r, 0)); }
		if (k % 500 === 0) debug('frame %d/%d (encoded %d, queue %d) %d ms', k, nFrames, encoded, encoder.encodeQueueSize, performance.now() - tStart);
	}
	debug('flushing encoder, %d/%d emitted', encoded, nFrames);
	await encoder.flush();
	if (failure) throw failure;
	encoder.close();
	muxer.finalize();
	debug('done: %d frames, %d MB, %d ms (draw %d, frame+encode submit %d, waiting on encoder %d)', encoded, (target.buffer.byteLength / 2 ** 20).toFixed(1), performance.now() - tStart, tDraw, tSubmit, tWait);
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
