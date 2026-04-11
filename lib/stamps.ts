export interface StampInfo {
  name: string;
  file: string;
  label: string;
}

export const USER_STAMPS: StampInfo[] = [
  { name: 'neuroNya',      file: 'neuroNya.png',       label: 'Nya' },
  { name: 'neuroBlush',    file: 'neuroBlush.png',     label: 'Blush' },
  { name: 'neuroHeart',    file: 'neuroHeart.png',     label: 'Heart' },
  { name: 'neuroNod',      file: 'neuroNod.gif',       label: 'Nod' },
  { name: 'neuroSleep',    file: 'neuroSleep.png',     label: 'Sleep' },
  { name: 'neuroBongo',    file: 'neuroBongo.gif',     label: 'Bongo' },
  { name: 'ChinoConfused', file: 'ChinoConfused.png',  label: 'Confused' },
  { name: 'ChinoNani',     file: 'ChinoNani.png',      label: 'Nani!?' },
  { name: 'evilSmug',      file: 'evilSmug.png',       label: 'Smug' },
  { name: 'neuroSadDance', file: 'neuroSadDance.gif',  label: 'SadDance' },
  { name: 'laughAtThis',   file: 'LaughAtThisGuy.png', label: 'Lol' },
  { name: 'neuroHuggie',   file: 'neuroHuggie.png',    label: 'Huggie' },
  { name: 'neuroAAAA',     file: 'neuroAAAA.png',       label: 'AAAA' },
  { name: 'neuroYareYare', file: 'neuroYareYare.png',  label: 'Yare Yare' },
];

export const STAMP_BY_NAME: Record<string, StampInfo> = Object.fromEntries(
  USER_STAMPS.map(s => [s.name, s])
);
