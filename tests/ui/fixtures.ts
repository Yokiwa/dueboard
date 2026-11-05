import type { Dashboard } from '../../src/core/dashboard';
import type { Course, CourseLink, Item } from '../../src/core/types';

export const NOW = new Date('2026-11-04T12:00:00-05:00');

export const course = (id: string, code: string, p: Partial<Course> = {}): Course => ({
  id, code, name: `${code} name`, sources: { brightspace: id }, color: '#2563EB', hidden: false, url: `https://purdue.brightspace.com/d2l/home/${id}`, partial: false, ...p,
});
export const item = (id: string, courseId: string, title: string, dueAt: string | null, p: Partial<Item> = {}): Item => ({
  id, courseId, title, type: 'assignment', dueAt: dueAt ? new Date(dueAt).toISOString() : null, url: `https://x/${id}`,
  sources: ['brightspace'], sourceKeys: [id], submitted: false, doneByUser: false, ...p,
});
export const link = (courseId: string, label: string, category: CourseLink['category'], url = `https://x/${label}`): CourseLink => ({
  courseId, label, url, category, source: 'brightspace',
});
export const dash = (p: Partial<Dashboard>): Dashboard => ({ courses: [], items: [], links: [], nextDue: null, ...p });
