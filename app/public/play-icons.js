// One line-icon set for the Play controls (2026-11-13), instead of mixed emoji: 24×24, drawn
// with the text colour (currentColor), so they follow light/dark and button states.
const P={
  pin:'<path d="M12 21s-6-5.6-6-10.5A6 6 0 0 1 18 10.5C18 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bed:'<path d="M3 18v-8M3 14h18v4M21 18v-4a3 3 0 0 0-3-3h-7v3"/><circle cx="7" cy="11.5" r="1.6"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  door:'<path d="M6 21V4h9v17M15 4l4 1.5V21H4"/><circle cx="12.5" cy="12.5" r=".8"/>',
  enter:'<path d="M10 7l5 5-5 5M15 12H3M14 4h5v16h-5"/>',
  back:'<path d="M9 14l-5-5 5-5M4 9h11a5 5 0 0 1 0 10h-3"/>',
  swap:'<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  car:'<path d="M5 16V12l2-5h10l2 5v4M5 16h14M7.5 19a1.5 1.5 0 1 0 0-.01M16.5 19a1.5 1.5 0 1 0 0-.01M5 12h14"/>',
  walk:'<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2-6-2-3 1-5 4 3 3 1M12 15l3 6M9 9l-2 4"/>',
  book:'<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10"/>',
  heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  mail:'<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  expand:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>',
  dots:'<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  wave:'<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-.5A5.5 5.5 0 0 1 5 13.5L4 10a1.5 1.5 0 0 1 2.7-1.2L8 11"/>',
  map:'<path d="M9 4.5L3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2zM9 4.5v13M15 6.5v13"/>',
  help:'<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5V14M12 17h.01"/>'
};
export const icon=(name,label='')=>`<svg class="lu-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${label?`role="img" aria-label="${label}"`:'aria-hidden="true"'}>${P[name]||''}</svg>`;
