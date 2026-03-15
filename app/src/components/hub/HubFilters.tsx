'use client';

import { useState } from 'react';

interface HubFiltersProps {
  initialSearch?: string;
  initialGenre?: string;
  genres: string[];
  onFilter: (search: string, genre: string) => void;
}

export default function HubFilters({ initialSearch = '', initialGenre = '', genres, onFilter }: HubFiltersProps) {
  const [search, setSearch] = useState(initialSearch);
  const [genre, setGenre] = useState(initialGenre);

  function handleSearchChange(value: string) {
    setSearch(value);
    onFilter(value, genre);
  }

  function handleGenreChange(value: string) {
    setGenre(value);
    onFilter(search, value);
  }

  const inputClass = 'bg-[var(--surface-dark)]/5 border border-[var(--surface-dark)]/20 p-2 text-sm font-[family-name:var(--font-terminal)] focus:border-[var(--accent-teal)] focus:outline-none';

  return (
    <div className="flex gap-3 items-center">
      <input
        className={inputClass + ' flex-1'}
        type="text"
        placeholder="Search campaigns..."
        value={search}
        onChange={e => handleSearchChange(e.target.value)}
      />
      <select
        className={inputClass + ' min-w-[140px]'}
        value={genre}
        onChange={e => handleGenreChange(e.target.value)}
      >
        <option value="">All Genres</option>
        {genres.map(g => <option key={g} value={g}>{g}</option>)}
      </select>
    </div>
  );
}
