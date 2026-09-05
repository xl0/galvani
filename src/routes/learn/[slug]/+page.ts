import { error } from '@sveltejs/kit';
import { chapters } from '$lib/learn';
export const entries = () => chapters.map((c) => ({ slug: c.slug }));
export const load = ({ params }) => {
	const index = chapters.findIndex((c) => c.slug === params.slug);
	if (index < 0) error(404, 'no such chapter');
	return { index };
};
