export function slug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

export function createDateSlug(title: string): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const titleSlug = slug(title);
  return `${date}-${titleSlug}`;
}