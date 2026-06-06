import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const samplesDir = join(rootDir, 'public', 'samples');

const writeJson = (fileName, value) => {
  writeFileSync(join(samplesDir, fileName), `${JSON.stringify(value, null, 2)}\n`);
};

const ease = {
  i: { x: [0.667], y: [1] },
  o: { x: [0.333], y: [0] },
};

const animatedNumber = (from, to, start = 0, end = 120) => ({
  a: 1,
  k: [
    { t: start, s: [from], e: [to], ...ease },
    { t: end, s: [to] },
  ],
});

const animatedPoint = (from, to, start = 0, end = 120) => ({
  a: 1,
  k: [
    { t: start, s: from, e: to, ...ease },
    { t: end, s: to },
  ],
});

const staticTransform = (position, scale = [100, 100, 100], opacity = 100) => ({
  o: { a: 0, k: opacity },
  r: { a: 0, k: 0 },
  p: { a: 0, k: position },
  a: { a: 0, k: [0, 0, 0] },
  s: { a: 0, k: scale },
});

const animatedTransform = (position, options = {}) => ({
  o: options.opacity ?? { a: 0, k: 100 },
  r: options.rotation ?? { a: 0, k: 0 },
  p: options.position ?? { a: 0, k: position },
  a: { a: 0, k: options.anchor ?? [0, 0, 0] },
  s: options.scale ?? { a: 0, k: [100, 100, 100] },
});

const base = (name, layers, extra = {}) => ({
  v: '5.7.0',
  fr: extra.fr ?? 60,
  ip: 0,
  op: extra.op ?? 120,
  w: extra.w ?? 512,
  h: extra.h ?? 512,
  nm: name,
  ddd: 0,
  assets: extra.assets ?? [],
  layers,
  fonts: extra.fonts,
  chars: extra.chars,
  markers: [],
  props: {},
});

const ellipse = (size, color, name = 'Ellipse') => [
  { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: size }, nm: `${name} Path` },
  { ty: 'fl', c: { a: 0, k: color }, o: { a: 0, k: 100 }, nm: `${name} Fill` },
];

const strokeEllipse = (size, color, width, name = 'Stroke Ellipse') => [
  { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: size }, nm: `${name} Path` },
  {
    ty: 'st',
    c: { a: 0, k: color },
    o: { a: 0, k: 100 },
    w: { a: 0, k: width },
    lc: 2,
    lj: 2,
    nm: `${name} Stroke`,
  },
];

const rect = (size, color, radius = 0, name = 'Rect') => [
  {
    ty: 'rc',
    p: { a: 0, k: [0, 0] },
    s: { a: 0, k: size },
    r: { a: 0, k: radius },
    nm: `${name} Path`,
  },
  { ty: 'fl', c: { a: 0, k: color }, o: { a: 0, k: 100 }, nm: `${name} Fill` },
];

const shapeLayer = (ind, name, shapes, ks, extra = {}) => ({
  ddd: 0,
  ind,
  ty: 4,
  nm: name,
  sr: 1,
  ks,
  ao: 0,
  shapes,
  ip: extra.ip ?? 0,
  op: extra.op ?? 120,
  st: 0,
  bm: 0,
});

const circleLogoSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
    <defs>
      <linearGradient id="g" x1="20" y1="20" x2="160" y2="160" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#7c3aed"/>
        <stop offset="0.52" stop-color="#06b6d4"/>
        <stop offset="1" stop-color="#22c55e"/>
      </linearGradient>
    </defs>
    <rect width="180" height="180" rx="42" fill="#111827"/>
    <circle cx="90" cy="90" r="54" fill="url(#g)"/>
    <path d="M63 95l20 20 38-55" fill="none" stroke="white" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
).toString('base64');

mkdirSync(samplesDir, { recursive: true });

writeJson(
  'orbit-dashboard.json',
  base('Orbit Dashboard', [
    shapeLayer(
      1,
      'Outer Orbit',
      [
        ...strokeEllipse([260, 260], [0.47, 0.45, 1, 1], 16, 'Outer Orbit'),
        {
          ty: 'tm',
          s: { a: 0, k: 4 },
          e: { a: 0, k: 82 },
          o: animatedNumber(0, 360),
          nm: 'Orbit Trim',
        },
      ],
      animatedTransform([256, 256, 0], { rotation: animatedNumber(0, 360) }),
    ),
    shapeLayer(
      2,
      'Signal Sweep',
      [
        ...strokeEllipse([340, 340], [0.08, 0.75, 0.61, 1], 8, 'Signal Sweep'),
        {
          ty: 'tm',
          s: { a: 0, k: 0 },
          e: animatedNumber(20, 72),
          o: animatedNumber(0, -360),
          nm: 'Sweep Trim',
        },
      ],
      animatedTransform([256, 256, 0], { rotation: animatedNumber(0, -180) }),
    ),
    shapeLayer(3, 'Core Pulse', ellipse([74, 74], [0.18, 0.86, 0.62, 1], 'Core'), animatedTransform([256, 256, 0], {
      scale: {
        a: 1,
        k: [
          { t: 0, s: [88, 88, 100], e: [118, 118, 100], ...ease },
          { t: 60, s: [118, 118, 100], e: [88, 88, 100], ...ease },
          { t: 120, s: [88, 88, 100] },
        ],
      },
    })),
    shapeLayer(4, 'Background Plate', rect([512, 512], [0.025, 0.027, 0.04, 1], 0, 'Plate'), staticTransform([256, 256, 0]), { op: 120 }),
  ]),
);

writeJson(
  'gradient-cards.json',
  base('Gradient Cards', [
    shapeLayer(
      1,
      'Primary Card',
      [
        {
          ty: 'rc',
          p: { a: 0, k: [0, 0] },
          s: { a: 0, k: [360, 190] },
          r: { a: 0, k: 24 },
          nm: 'Card Shape',
        },
        {
          ty: 'gf',
          o: { a: 0, k: 100 },
          r: 1,
          bm: 0,
          g: {
            p: 3,
            k: {
              a: 0,
              k: [0, 0.32, 0.27, 0.95, 0.5, 0.05, 0.72, 0.84, 1, 0.13, 0.77, 0.55],
            },
          },
          s: { a: 0, k: [-180, -95] },
          e: { a: 0, k: [180, 95] },
          nm: 'Card Gradient',
        },
      ],
      animatedTransform([256, 256, 0], {
        rotation: animatedNumber(-7, 7),
        scale: animatedPoint([92, 92, 100], [100, 100, 100], 0, 120),
      }),
    ),
    shapeLayer(2, 'Accent Dot Left', ellipse([58, 58], [1, 0.42, 0.61, 1], 'Dot'), staticTransform([170, 215, 0])),
    shapeLayer(3, 'Accent Dot Right', ellipse([42, 42], [1, 0.91, 0.42, 1], 'Dot'), staticTransform([338, 312, 0])),
    shapeLayer(4, 'Background', rect([512, 512], [0.04, 0.04, 0.055, 1], 0, 'Background'), staticTransform([256, 256, 0])),
  ]),
);

writeJson(
  'merge-paths.json',
  base('Merge Paths', [
    shapeLayer(
      1,
      'Merged Flower',
      [
        { ty: 'el', p: { a: 0, k: [-48, 0] }, s: { a: 0, k: [136, 136] }, nm: 'Left Circle' },
        { ty: 'el', p: { a: 0, k: [48, 0] }, s: { a: 0, k: [136, 136] }, nm: 'Right Circle' },
        { ty: 'mm', mm: 1, nm: 'Merge' },
        { ty: 'fl', c: { a: 0, k: [0.88, 0.25, 0.47, 1] }, o: { a: 0, k: 100 }, nm: 'Merged Fill' },
      ],
      animatedTransform([256, 256, 0], { rotation: animatedNumber(0, 360) }),
    ),
    shapeLayer(2, 'Inner Cutout Hint', strokeEllipse([120, 120], [1, 1, 1, 1], 10, 'Hint'), staticTransform([256, 256, 0], [100, 100, 100], 72)),
  ]),
);

writeJson(
  'text-title.json',
  base(
    'Text Title',
    [
      {
        ddd: 0,
        ind: 1,
        ty: 5,
        nm: 'Editable Title',
        sr: 1,
        ks: animatedTransform([256, 232, 0], {
          opacity: animatedNumber(25, 100),
          scale: animatedPoint([82, 82, 100], [100, 100, 100]),
        }),
        ao: 0,
        t: {
          d: {
            k: [
              {
                s: {
                  sz: [480, 100],
                  ps: [-240, -50],
                  s: 52,
                  f: 'NotoSansSC',
                  t: 'AnimaX',
                  j: 2,
                  tr: 8,
                  lh: 62,
                  fc: [0.95, 0.96, 1],
                },
                t: 0,
              },
            ],
          },
          p: {},
          m: { g: 1, a: { a: 0, k: [0, 0] } },
          a: [],
        },
        ip: 0,
        op: 120,
        st: 0,
        bm: 0,
      },
      shapeLayer(2, 'Underline', rect([250, 8], [0.38, 0.4, 0.95, 1], 4, 'Underline'), animatedTransform([256, 292, 0], {
        scale: animatedPoint([0, 100, 100], [100, 100, 100]),
      })),
      shapeLayer(3, 'Background', rect([512, 512], [0.03, 0.032, 0.05, 1], 0, 'Background'), staticTransform([256, 256, 0])),
    ],
    {
      fonts: {
        list: [
          {
            fName: 'NotoSansSC',
            fFamily: 'Noto Sans SC',
            fStyle: 'Regular',
            ascent: 75,
          },
        ],
      },
    },
  ),
);

writeJson(
  'precomp-orbit.json',
  base(
    'Precomp Orbit',
    [
      {
        ddd: 0,
        ind: 1,
        ty: 0,
        nm: 'Orbit Precomp',
        refId: 'orbit_precomp',
        sr: 1,
        ks: animatedTransform([256, 256, 0], { rotation: animatedNumber(0, 360) }),
        ao: 0,
        w: 200,
        h: 200,
        ip: 0,
        op: 120,
        st: 0,
        bm: 0,
      },
      shapeLayer(2, 'Background', rect([512, 512], [0.02, 0.02, 0.027, 1], 0, 'Background'), staticTransform([256, 256, 0])),
    ],
    {
      assets: [
        {
          id: 'orbit_precomp',
          w: 200,
          h: 200,
          layers: [
            shapeLayer(1, 'Satellite', ellipse([42, 42], [0.13, 0.77, 0.55, 1], 'Satellite'), staticTransform([100, 22, 0])),
            shapeLayer(2, 'Track', strokeEllipse([160, 160], [0.47, 0.45, 1, 1], 10, 'Track'), staticTransform([100, 100, 0])),
          ],
        },
      ],
    },
  ),
);

writeJson(
  'embedded-image.json',
  base(
    'Embedded Image',
    [
      {
        ddd: 0,
        ind: 1,
        ty: 2,
        nm: 'Embedded Badge',
        refId: 'img_badge',
        sr: 1,
        ks: animatedTransform([256, 256, 0], {
          rotation: animatedNumber(-10, 10),
          scale: animatedPoint([82, 82, 100], [112, 112, 100], 0, 120),
        }),
        ao: 0,
        ip: 0,
        op: 120,
        st: 0,
        bm: 0,
      },
      shapeLayer(2, 'Background', rect([512, 512], [0.025, 0.027, 0.04, 1], 0, 'Background'), staticTransform([256, 256, 0])),
    ],
    {
      assets: [
        {
          id: 'img_badge',
          w: 180,
          h: 180,
          u: '',
          p: `data:image/svg+xml;base64,${circleLogoSvg}`,
          e: 1,
        },
      ],
    },
  ),
);

writeJson(
  'trim-loader.json',
  base('Trim Loader', [
    shapeLayer(
      1,
      'Loader Arc',
      [
        ...strokeEllipse([250, 250], [0.38, 0.4, 0.95, 1], 22, 'Loader Arc'),
        {
          ty: 'tm',
          s: animatedNumber(0, 45),
          e: animatedNumber(20, 100),
          o: animatedNumber(0, 720),
          nm: 'Loader Trim',
        },
      ],
      staticTransform([256, 256, 0]),
    ),
    shapeLayer(2, 'Center Glow', ellipse([96, 96], [0.06, 0.72, 0.84, 1], 'Glow'), animatedTransform([256, 256, 0], {
      opacity: animatedNumber(45, 95),
    })),
  ]),
);

writeJson(
  'simple-shape.json',
  base('AnimaX Public Sample', [
    shapeLayer(
      1,
      'Rotating Ring',
      [
        ...strokeEllipse([220, 220], [0.38, 0.4, 0.95, 1], 18, 'Ring'),
        {
          ty: 'tm',
          s: { a: 0, k: 0 },
          e: { a: 0, k: 72 },
          o: { a: 0, k: 0 },
          nm: 'Trim Paths',
        },
      ],
      animatedTransform([256, 256, 0], { rotation: animatedNumber(0, 360) }),
    ),
    shapeLayer(2, 'Center Dot', ellipse([64, 64], [0.13, 0.77, 0.55, 1], 'Dot'), staticTransform([256, 256, 0])),
  ]),
);
