// Fayz Market icon set — 24px grid, 1.8 stroke, round caps. Hand-authored; no icon dependency.
const paths = {
  home: 'M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-5.8H9.2v5.8H5A1.5 1.5 0 0 1 3.5 19z',
  grid: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  bag: 'M5 8h14l-1 11.2a1.9 1.9 0 0 1-1.9 1.8H7.9A1.9 1.9 0 0 1 6 19.2zM8.8 8V6.8a3.2 3.2 0 0 1 6.4 0V8',
  receipt: 'M6 3.5h12v17l-2.4-1.6-2.4 1.6-1.2-.8-1.2.8-2.4-1.6L6 20.5zM9 8.5h6M9 12h6M9 15.5h3.5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c.8-3.6 3.8-5.8 7.5-5.8s6.7 2.2 7.5 5.8',
  search: 'M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4zM16 16l4.5 4.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  share: 'M12 3.5v11M7.5 8 12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 8v5M12 16.5v.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  wifiOff: 'M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.2-2.4M19 12.9a10 10 0 0 0-2.9-2M2 9.4a15 15 0 0 1 4.1-2.6M22 9.4A15 15 0 0 0 10.6 5.6M12 20h.01',
  box: 'M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12l8.5-4.5M12 12v9',
  layers: 'M12 3.5 21 8l-9 4.5L3 8zM3 12l9 4.5 9-4.5M3 16l9 4.5 9-4.5',
  chart: 'M4 20V10M10 20V4M16 20v-7M2.5 20.5h19',
  settings: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.6 1.2-1.9 3.3-1.9-.7a7.5 7.5 0 0 1-2 1.2l-.3 2H11l-.3-2a7.5 7.5 0 0 1-2-1.2l-1.9.7-1.9-3.3 1.6-1.2a7.6 7.6 0 0 1 0-3L4.9 9.3 6.8 6l1.9.7a7.5 7.5 0 0 1 2-1.2l.3-2h3.8l.3 2a7.5 7.5 0 0 1 2 1.2l1.9-.7 1.9 3.3-1.6 1.2a7.6 7.6 0 0 1 0 3z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  logout: 'M14.5 4.5H18A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5h-3.5M10 16.5 5.5 12 10 7.5M5.5 12h10',
  image: 'M4.5 4.5h15v15h-15zM4.5 16l4.5-4.5 4 4 2.5-2.5 4 4M15 9.5h.01',
  trash: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7',
  edit: 'M4.5 19.5h4l10-10a2.1 2.1 0 0 0-4-4l-10 10zM13.5 6.5l4 4',
  wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H18v2.5M4 7.5v10A2.5 2.5 0 0 0 6.5 20H20V10H6.5A2.5 2.5 0 0 1 4 7.5zM16 15h.01',
  phone: 'M8.4 3.5H5.5a2 2 0 0 0-2 2.2A16 16 0 0 0 18.3 20.5a2 2 0 0 0 2.2-2v-2.9l-4-1.6-2 2a12 12 0 0 1-5-5l2-2z',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  truck: 'M2.5 6h11v10h-11zM13.5 9.5h4l3 3.5V16h-7M7 18.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM17 18.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z',
  server: 'M4 4.5h16v6H4zM4 13.5h16v6H4zM7.5 7.5h.01M7.5 16.5h.01',
  tag: 'M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0zM8.5 8.5h.01',
  upload: 'M12 15.5V4M7.5 8.5 12 4l4.5 4.5M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.3 3.2-5.3 6.5-5.3s5.9 2 6.5 5.3M16 4.3a3.5 3.5 0 0 1 0 6.6M18 14.9c2 .7 3.2 2.5 3.5 5.1',
  sort: 'M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z',
  palette: 'M12 20.5a8.5 8.5 0 1 1 8.5-8.5c0 2.4-1.9 3.5-3.6 3.5h-1.6a1.8 1.8 0 0 0-1.3 3.1c.6.6.4 1.9-.9 1.9zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
  note: 'M5 4.5h14v15H5zM8.5 9h7M8.5 12.5h7M8.5 16h4',
  star: 'M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z',
  lock: 'M6.5 10.5h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2',
  fingerprint: 'M7.4 5.6A8 8 0 0 1 19.8 12v1.5M4.2 9.5A8 8 0 0 0 4 12v2M8 12a4 4 0 0 1 8 0v2.5a10 10 0 0 1-1.2 4.8M12 12v2.5a14 14 0 0 1-2 7M8.2 16a14 14 0 0 1-1.7 4.3M16.8 19.6a14 14 0 0 0 .6-2.1',
  navigation: 'M20.5 3.5 3.5 10.6l7 2.9 2.9 7z',
  camera: 'M4.5 8h3l1.6-2.5h5.8L16.5 8h3A1.5 1.5 0 0 1 21 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-9A1.5 1.5 0 0 1 4.5 8zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0',
  shield: 'M12 3.5 19.5 6v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6zM9 12l2 2 4-4',
  map: 'M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5L3.5 20zM9 4v13.5M15 6.5V20',
  clock: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 7.5V12l3 2',
  send: 'M20.5 3.5 10 14M20.5 3.5l-6.5 17-4-6.5-6.5-4z',
  mail: 'M4 6.5h16v11H4zM4.5 7l7.5 6 7.5-6',
  key: 'M14.5 13a5 5 0 1 0-4.6-3L3.5 16.4v3.1h3.1v-2.1h2.1v-2.1h2.1l1.6-1.6a5 5 0 0 0 2.1.3zM16.5 7.5h.01',
  plug: 'M9 3.5v4M15 3.5v4M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0zM12 16v4.5',
  courier: 'M3.5 6.5h10v9h-10zM13.5 9.5h3.8l3.2 3.4v2.6h-7M7 18.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM17 18.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z',
  history: 'M4 12a8 8 0 1 0 2.4-5.7M4 4.5v4h4M12 8v4l2.8 1.8',
  target: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 22, stroke = 1.8, className, filled }: { name: IconName; size?: number; stroke?: number; className?: string; filled?: boolean }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}

/** The Fayz Market mark: the shopping bag with an F, drawn from the launcher icon geometry. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true" focusable="false" className="brand-mark">
    <rect width="1024" height="1024" rx="232" fill="var(--accent)" />
    <path d="M307 379h410l-28 396c-3 42-38 74-80 74H415c-42 0-77-32-80-74z" fill="#fff" stroke="#1E1E1E" strokeWidth="36" strokeLinejoin="round" />
    <path d="M405 390v-69c0-63 47-112 107-112s107 49 107 112v69" fill="none" stroke="#1E1E1E" strokeWidth="40" strokeLinecap="round" />
    <path d="M450 487v250m0-250h150m-150 110h124" fill="none" stroke="#1E1E1E" strokeWidth="46" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
