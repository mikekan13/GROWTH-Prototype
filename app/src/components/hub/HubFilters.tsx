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

  return (
    <div className="bg-[var(--surface-dark)] border border-[var(--accent-teal)]/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[var(--accent-teal)]/40 text-[8px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase">
          Filter Stream
        </span>
        <div className="flex-1 h-[1px] bg-[var(--accent-teal)]/15" />
      </div>
      <div className="flex gap-3 items-center">
        <input
          className="flex-1 bg-black/40 border border-[var(--accent-teal)]/20 px-3 py-2 text-sm text-[var(--accent-teal)] placeholder:text-[var(--accent-teal)]/25 font-[family-name:var(--font-terminal)] tracking-wider focus:border-[var(--accent-teal)]/60 focus:outline-none"
          type="text"
          placeholder="Search campaigns..."
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
        />
        <select
          className="bg-black/40 border border-[var(--accent-teal)]/20 px-3 py-2 text-sm text-[var(--accent-teal)] font-[family-name:var(--font-terminal)] tracking-wider focus:border-[var(--accent-teal)]/60 focus:outline-none min-w-[140px] appearance-none cursor-pointer"
          value={genre}
          onChange={e => handleGenreChange(e.target.value)}
        >
          <option value="">All Genres</option>
          {genres.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
    </div>
  );
}
