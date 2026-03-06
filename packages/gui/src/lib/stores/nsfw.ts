import { writable } from 'svelte/store';

export type NsfwMode = 'sfw' | 'nsfw' | 'all';

export const nsfwMode = writable<NsfwMode>('sfw');
