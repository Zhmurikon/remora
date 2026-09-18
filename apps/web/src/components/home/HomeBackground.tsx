const motifs = [
  { shape: 'cards', top: '3%', side: 'left', offset: '2%', turn: '-17deg', size: 50 },
  { shape: 'dots', top: '7%', side: 'right', offset: '7%', turn: '12deg', size: 30 },
  { shape: 'spark', top: '14%', side: 'left', offset: '6%', turn: '9deg', size: 24 },
  { shape: 'fish', top: '20%', side: 'right', offset: '2%', turn: '-24deg', size: 55 },
  { shape: 'wave', top: '29%', side: 'left', offset: '3%', turn: '28deg', size: 42 },
  { shape: 'dots', top: '36%', side: 'right', offset: '5%', turn: '-8deg', size: 28 },
  { shape: 'cards', top: '44%', side: 'left', offset: '1%', turn: '15deg', size: 44 },
  { shape: 'spark', top: '51%', side: 'right', offset: '3%', turn: '-12deg', size: 26 },
  { shape: 'dots', top: '60%', side: 'left', offset: '5%', turn: '17deg', size: 30 },
  { shape: 'wave', top: '67%', side: 'right', offset: '2%', turn: '-19deg', size: 44 },
  { shape: 'fish', top: '75%', side: 'left', offset: '2%', turn: '16deg', size: 52 },
  { shape: 'spark', top: '82%', side: 'right', offset: '7%', turn: '11deg', size: 23 },
  { shape: 'cards', top: '89%', side: 'right', offset: '2%', turn: '-14deg', size: 43 },
  { shape: 'dots', top: '96%', side: 'left', offset: '4%', turn: '-13deg', size: 28 },
  { shape: 'spark', top: '2%', side: 'right', offset: '3%', turn: '23deg', size: 20 },
  { shape: 'wave', top: '5%', side: 'left', offset: '12%', turn: '-11deg', size: 32 },
  { shape: 'dots', top: '9%', side: 'left', offset: '3%', turn: '21deg', size: 24 },
  { shape: 'cards', top: '11%', side: 'right', offset: '1%', turn: '18deg', size: 34 },
  { shape: 'wave', top: '16%', side: 'right', offset: '5%', turn: '-8deg', size: 30 },
  { shape: 'spark', top: '18%', side: 'left', offset: '2%', turn: '-19deg', size: 21 },
  { shape: 'dots', top: '23%', side: 'left', offset: '5%', turn: '7deg', size: 26 },
  { shape: 'cards', top: '25%', side: 'right', offset: '4%', turn: '-21deg', size: 36 },
  { shape: 'spark', top: '27%', side: 'right', offset: '1%', turn: '16deg', size: 20 },
  { shape: 'wave', top: '32%', side: 'right', offset: '6%', turn: '14deg', size: 31 },
  { shape: 'dots', top: '34%', side: 'left', offset: '2%', turn: '-17deg', size: 23 },
  { shape: 'cards', top: '38%', side: 'left', offset: '6%', turn: '-9deg', size: 33 },
  { shape: 'wave', top: '41%', side: 'right', offset: '2%', turn: '25deg', size: 34 },
  { shape: 'spark', top: '46%', side: 'right', offset: '5%', turn: '-26deg', size: 22 },
  { shape: 'dots', top: '48%', side: 'left', offset: '4%', turn: '18deg', size: 25 },
  { shape: 'cards', top: '54%', side: 'right', offset: '1%', turn: '12deg', size: 32 },
  { shape: 'spark', top: '56%', side: 'left', offset: '2%', turn: '27deg', size: 20 },
  { shape: 'wave', top: '58%', side: 'right', offset: '5%', turn: '-16deg', size: 33 },
  { shape: 'dots', top: '63%', side: 'right', offset: '3%', turn: '-23deg', size: 24 },
  { shape: 'cards', top: '65%', side: 'left', offset: '1%', turn: '-18deg', size: 35 },
  { shape: 'spark', top: '70%', side: 'left', offset: '5%', turn: '14deg', size: 21 },
  { shape: 'wave', top: '72%', side: 'right', offset: '4%', turn: '22deg', size: 30 },
  { shape: 'cards', top: '78%', side: 'right', offset: '2%', turn: '-12deg', size: 34 },
  { shape: 'dots', top: '80%', side: 'left', offset: '6%', turn: '11deg', size: 25 },
  { shape: 'wave', top: '85%', side: 'left', offset: '2%', turn: '-24deg', size: 32 },
  { shape: 'spark', top: '91%', side: 'left', offset: '5%', turn: '19deg', size: 20 },
  { shape: 'cards', top: '94%', side: 'right', offset: '6%', turn: '23deg', size: 33 },
  { shape: 'dots', top: '98%', side: 'right', offset: '2%', turn: '-9deg', size: 24 },
  { shape: 'dots', top: '150px', side: 'left', offset: '17%', turn: '-12deg', size: 23 },
  { shape: 'cards', top: '245px', side: 'right', offset: '13%', turn: '16deg', size: 31 },
  { shape: 'spark', top: '390px', side: 'left', offset: '7%', turn: '24deg', size: 21 },
  { shape: 'wave', top: '525px', side: 'right', offset: '15%', turn: '-18deg', size: 30 },
  { shape: 'dots', top: '730px', side: 'left', offset: '4%', turn: '11deg', size: 25 },
  { shape: 'spark', top: '860px', side: 'right', offset: '3%', turn: '-16deg', size: 20 },
  { shape: 'cards', top: '1080px', side: 'left', offset: '9%', turn: '-23deg', size: 32 },
  { shape: 'dots', top: '1240px', side: 'right', offset: '5%', turn: '18deg', size: 24 },
  { shape: 'wave', top: '1480px', side: 'left', offset: '3%', turn: '14deg', size: 31 },
  { shape: 'spark', top: '1730px', side: 'right', offset: '2%', turn: '-21deg', size: 22 },
] as const;

const paths = {
  cards: 'M15 10H34V35H15Z M10 16H6V41H26V38 M20 17H29 M20 23H27',
  dots: 'M13 13h.01 M29 10h.01 M11 29h.01 M28 27h.01',
  spark: 'M24 7V17 M24 31V41 M7 24H17 M31 24H41',
  fish: 'M7 24C16 10 30 10 37 24C30 38 16 38 7 24Z M37 24L45 17V31Z M15 22h.01 M24 14L29 8 M24 34L29 40',
  wave: 'M5 20C11 12 17 28 23 20S35 28 43 20 M9 29C15 21 21 37 27 29S37 35 43 29',
};

export function HomeBackground() {
  return (
    <div className="home-background" aria-hidden="true">
      {/* Фиксированные позиции дают нерегулярный ритм без скачков при гидратации. */}
      {motifs.map((motif, index) => (
        <svg
          key={index}
          className={`home-background-motif home-background-${motif.shape}`}
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth={motif.shape === 'dots' ? 4 : 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
          style={{
            top: motif.top,
            [motif.side]: motif.offset,
            width: motif.size,
            height: motif.size,
            transform: `rotate(${motif.turn})`,
          }}
        >
          <path d={paths[motif.shape]} />
        </svg>
      ))}
    </div>
  );
}
