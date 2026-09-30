const knowledgeNodes = [
  { top: '3.4%', left: '43%', label: 'конспект', tone: 'mint' },
  { top: '8.6%', left: '91%', label: 'связать', tone: 'peach' },
  { top: '15.2%', left: '4%', label: 'вопрос', tone: 'plain' },
  { top: '25.5%', left: '94%', label: 'понять', tone: 'lavender' },
  { top: '37.5%', left: '2.5%', label: 'проверить', tone: 'mint' },
  { top: '50%', left: '95%', label: 'повторить', tone: 'peach' },
  { top: '63%', left: '4%', label: 'закрепить', tone: 'lavender' },
  { top: '76%', left: '94%', label: 'вспомнить', tone: 'mint' },
  { top: '89%', left: '3%', label: 'знать', tone: 'peach' },
] as const;

const mainRoute =
  'M680 0 C610 360 940 620 830 1020 C690 1510 300 1660 360 2220 C420 2770 1310 2560 1250 3250 C1190 3900 390 3730 430 4480 C470 5200 1280 5010 1190 5700 C1110 6330 360 6300 410 7000 C460 7680 1240 7480 1150 8240 C1080 8790 690 9180 780 10000';

const branches = [
  'M830 1020 C1090 850 1300 820 1560 900',
  'M360 2220 C230 2070 120 2020 0 2040',
  'M1250 3250 C1370 3050 1480 2980 1600 3000',
  'M430 4480 C260 4300 130 4270 0 4320',
  'M1190 5700 C1370 5510 1490 5480 1600 5510',
  'M410 7000 C250 6810 120 6790 0 6850',
  'M1150 8240 C1340 8050 1470 8040 1600 8100',
] as const;

export function HomeBackground() {
  return (
    <div className="home-background" aria-hidden="true">
      <div className="home-memory-wash home-memory-wash-mint" />
      <div className="home-memory-wash home-memory-wash-peach" />

      <svg
        className="home-memory-map"
        viewBox="0 0 1600 10000"
        preserveAspectRatio="none"
        fill="none"
        focusable="false"
      >
        <g className="home-memory-branches">
          {branches.map((path) => (
            <path key={path} d={path} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
        <path className="home-memory-route-base" d={mainRoute} vectorEffect="non-scaling-stroke" />
        <path
          className="home-memory-route-active"
          data-home-memory-route
          d={mainRoute}
          pathLength="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <svg className="home-memory-cluster" viewBox="0 0 760 520" fill="none" focusable="false">
        <g className="home-memory-cluster-lines">
          <path d="M42 308C128 246 183 251 252 277S399 325 482 248 606 111 718 132" />
          <path d="M482 248C557 285 621 354 674 451" />
        </g>
        <g className="home-memory-cluster-active" data-home-memory-cluster>
          <path
            pathLength="1"
            d="M42 308C128 246 183 251 252 277S399 325 482 248 606 111 718 132"
          />
          <path pathLength="1" d="M482 248C557 285 621 354 674 451" />
        </g>
        <g className="home-memory-cluster-dots">
          <circle cx="42" cy="308" r="5" />
          <circle cx="252" cy="277" r="8" />
          <circle cx="482" cy="248" r="7" />
          <circle cx="674" cy="451" r="5" />
          <circle cx="718" cy="132" r="6" />
        </g>
      </svg>

      {knowledgeNodes.map((node, index) => (
        <div
          key={node.label}
          className={`home-memory-node home-memory-node-${node.tone}`}
          data-home-memory-node
          style={{ top: node.top, left: node.left }}
        >
          <span />
          <small>{node.label}</small>
          <i>{String(index + 1).padStart(2, '0')}</i>
        </div>
      ))}
    </div>
  );
}
