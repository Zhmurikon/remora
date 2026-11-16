/* global document, requestAnimationFrame, cancelAnimationFrame, matchMedia, Image, ResizeObserver, devicePixelRatio */
/** @param {HTMLElement} stage @param {AbortSignal} signal */
export function startBooks(stage, signal) {
  const canvas = stage.querySelector('#book-layer');
  const ctx = canvas.getContext('2d');
  const lamp = stage.querySelector('#lamp');
  const rect = { x: 136, y: 520, width: 648, height: 192 };
  const clamp = (t) => Math.max(0, Math.min(1, t));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (t) => {
    t = clamp(t);
    return t * t * (3 - 2 * t);
  };
  const pt = (x, y) => ({ x, y });
  const add = (a, b) => pt(a.x + b.x, a.y + b.y);
  const lerp = (a, b, t) => pt(mix(a.x, b.x, t), mix(a.y, b.y, t));
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const delta = (a, b) => pt(a.x - b.x, a.y - b.y);
  const sceneScale = 1254 / 800;
  const spineFoot = pt(721, 624.4),
    spineWidth = pt(14.4, 5.8),
    spineHeight = pt(20.2, -81.3);
  const deskSpine = pt(4.4, -14.2);
  const shelfTilt = (14 * Math.PI) / 180,
    deskTilt = (-80 * Math.PI) / 180;
  const shelfThickness = Math.hypot(spineWidth.x, spineWidth.y);
  const deskThickness = Math.hypot(deskSpine.x, deskSpine.y);
  const shelfSpineAngle = Math.atan2(spineWidth.y, spineWidth.x);
  const deskSpineAngle = Math.atan2(deskSpine.y, deskSpine.x);
  const fallPlaybackRate = 2;
  const shelfButton = stage.querySelector('#shelf');
  const pageButton = stage.querySelector('#open-book');
  let media;
  let landed = false,
    botanical = false;
  let fall = null,
    turn = null;
  let clock = 0,
    frame = 0;
  let light = 1,
    lightFrom = 1,
    lightTarget = 1,
    fadeTime = 0;

  function surface(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function polygon(g, points) {
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) g.lineTo(p.x, p.y);
    g.closePath();
  }
  // Локальное аффинное отображение сохраняет печатные строки и штриховку при сгибе.
  function triangle(g, img, source, target, overlap = 0) {
    const [a, b, c] = source,
      [p, q, r] = target;
    const ab = delta(b, a),
      ac = delta(c, a),
      pq = delta(q, p),
      pr = delta(r, p);
    const det = cross(ab, ac);
    if (Math.abs(det) < 0.000001 || Math.abs(cross(pq, pr)) < 0.0001) return;
    const A = (pq.x * ac.y - pr.x * ab.y) / det,
      B = (pq.y * ac.y - pr.y * ab.y) / det;
    const C = (pr.x * ab.x - pq.x * ac.x) / det,
      D = (pr.y * ab.x - pq.y * ac.x) / det;
    const center = pt((p.x + q.x + r.x) / 3, (p.y + q.y + r.y) / 3);
    g.save();
    polygon(
      g,
      overlap
        ? target.map((v) => {
            const ray = delta(v, center),
              length = Math.hypot(ray.x, ray.y) || 1;
            return pt(v.x + (ray.x * overlap) / length, v.y + (ray.y * overlap) / length);
          })
        : target,
    );
    g.clip();
    g.transform(A, B, C, D, p.x - A * a.x - C * a.y, p.y - B * a.x - D * a.y);
    g.drawImage(img, 0, 0);
    g.restore();
  }
  const edges = {
    right: [
      [pt(274, 634), pt(277, 610), pt(309, 609), pt(369, 634)],
      [pt(312.8, 679), pt(325, 640), pt(372, 664), pt(411.5, 663.6)],
    ],
    left: [
      [pt(274, 634), pt(250, 607), pt(221, 626), pt(174, 636.5)],
      [pt(312.8, 679), pt(292, 649), pt(245, 668), pt(206, 673.6)],
    ],
  };
  function cubic([p, a, b, q], u) {
    return lerp(lerp(lerp(p, a, u), lerp(a, b, u), u), lerp(lerp(a, b, u), lerp(b, q, u), u), u);
  }
  function restingPage(side, u, v) {
    const [back, front] = edges[side];
    return lerp(cubic(back, u), cubic(front, u), v);
  }
  function sheet(g, sourceAt, positionAt, textureAt, cols, rows, overlap) {
    let last;
    for (let col = 0; col <= cols; col++) {
      const u = col / cols;
      const strip = Array.from({ length: rows + 1 }, (_, row) => {
        const v = row / rows;
        return { from: sourceAt(u, v), to: positionAt(u, v) };
      });
      if (last) {
        for (let row = 0; row < rows; row++) {
          const t = textureAt((col - 0.5) / cols, (row + 0.5) / rows);
          for (const tri of [
            [last[row], strip[row], strip[row + 1]],
            [last[row], strip[row + 1], last[row + 1]],
          ]) {
            triangle(
              g,
              t,
              tri.map((p) => p.from),
              tri.map((p) => p.to),
              overlap,
            );
          }
        }
      }
      last = strip;
    }
  }
  const W = 240,
    H = 144;
  const uv = (u, v) => pt(u * W, v * H);
  function extractPage(drawing, side) {
    const c = surface(W, H);
    sheet(
      c.getContext('2d'),
      (u, v) => {
        const p = restingPage(side, u, v);
        return pt(p.x * sceneScale, p.y * sceneScale);
      },
      uv,
      () => drawing,
      18,
      3,
      1.2,
    );
    return c;
  }
  // На следующей странице видна небольшая ботаническая гравюра из читального зала.
  function botanicalPlate(page, isLit) {
    const c = surface(W, H),
      g = c.getContext('2d');
    g.drawImage(page, 0, 0);
    g.save();
    g.save();
    g.beginPath();
    g.rect(57, 19, 119, 103);
    g.clip();
    g.globalCompositeOperation = 'lighten';
    for (const [x, y] of [
      [1, 1],
      [-2, 1],
      [2, -2],
      [-3, 3],
      [3, 3],
      [0, -4],
      [2, 4],
    ])
      g.drawImage(page, x, y);
    g.restore();
    g.strokeStyle = isLit ? '#645773' : '#49577e';
    g.lineWidth = 0.85;
    g.beginPath();
    g.moveTo(95, 107);
    g.bezierCurveTo(103, 92, 117, 61, 139, 30);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      const x = 101 + i * 6.4,
        y = 96 - i * 10.8;
      for (const dir of [-1, 1]) {
        const dx = dir * (19 - i * 1.8),
          dy = -(10 + i * 0.4);
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + dx * 0.65, y + 1, x + dx, y + dy);
        g.quadraticCurveTo(x + dx * 0.8, y + dy * 0.94, x, y);
        g.stroke();
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + dx * 0.86, y + dy * 0.78);
        g.stroke();
      }
    }
    g.font = 'italic 7px Georgia';
    g.textAlign = 'center';
    g.fillStyle = g.strokeStyle;
    g.fillText('Fig. II', 116, 116);
    g.restore();
    return c;
  }

  function paintCloth() {
    const c = surface(200, 295),
      g = c.getContext('2d');
    g.fillStyle = '#415889';
    g.fillRect(0, 0, 200, 295);
    let seed = 307;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 5800; i++) {
      const x = rand() * 208 - 4,
        y = rand() * 304 - 4,
        len = 1 + 6 * rand();
      g.strokeStyle = i % 3 ? 'rgba(225,225,212,.30)' : 'rgba(14,35,76,.50)';
      g.lineWidth = 0.45 + rand() * 0.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + len, y - len * 0.8);
      g.stroke();
    }
    g.strokeStyle = '#dbcfab';
    g.lineWidth = 2.4;
    g.strokeRect(11, 13, 178, 268);
    g.lineWidth = 0.9;
    g.strokeRect(15, 17, 170, 260);
    g.fillStyle = '#f2dfaf';
    g.strokeStyle = '#d3bf93';
    g.beginPath();
    g.ellipse(100, 132, 26, 34, 0, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(87, 151);
    g.quadraticCurveTo(106, 132, 113, 111);
    g.stroke();
    for (let i = 0; i < 4; i++) {
      const x = 93 + i * 5,
        y = 144 - i * 8;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 10 * s, y - 2, x + 11 * s, y - 10);
        g.quadraticCurveTo(x + 4 * s, y - 9, x, y);
        g.fill();
      }
    }
    return c;
  }

  function placeFace(g, texture, origin, horizontal, vertical) {
    g.save();
    g.transform(
      horizontal.x / texture.width,
      horizontal.y / texture.width,
      vertical.x / texture.height,
      vertical.y / texture.height,
      origin.x,
      origin.y,
    );
    g.drawImage(texture, 0, 0);
    g.restore();
  }
  function sampleSpine(drawing) {
    const c = surface(42, 222),
      g = c.getContext('2d');
    const corner = add(spineFoot, spineHeight);
    const source = [corner, add(corner, spineWidth), spineFoot, add(spineFoot, spineWidth)].map(
      (p) => pt(p.x * sceneScale, p.y * sceneScale),
    );
    const target = [pt(0, 0), pt(42, 0), pt(0, 222), pt(42, 222)];
    for (const tri of [
      [0, 1, 3],
      [0, 3, 2],
    ])
      triangle(
        g,
        drawing,
        tri.map((i) => source[i]),
        tri.map((i) => target[i]),
        1,
      );
    return c;
  }
  function shelfGap() {
    // Выбираем тёмное дерево в глубине этой же ячейки. Край соседнего тома остаётся на месте.
    const gap = [pt(740.2, 542.1), pt(757, 546.5), pt(737, 632), pt(719.4, 625.2)];
    ctx.save();
    polygon(ctx, gap);
    ctx.clip();
    ctx.fillStyle = '#172e65';
    ctx.fillRect(718, 541, 40, 94);
    ctx.fillStyle = media.wood;
    ctx.translate(719, 541);
    ctx.fillRect(-2, -1, 42, 94);
    ctx.restore();
  }
  function closedBook(t) {
    const release = ease(t / 0.48),
      drop = clamp((t - 0.32) / 0.59);
    const fallEase = drop * drop;
    const after = Math.max(0, t - 0.91);
    const bounce = Math.exp(-10 * after) * Math.abs(Math.sin(21 * after));
    const angle = ((14.0 - 12 * release - 82 * fallEase + 8 * bounce) * Math.PI) / 180;
    const h = pt(Math.sin(angle) * mix(83.8, 89, drop), -Math.cos(angle) * mix(83.8, 89, drop));
    const p = pt(
      721 - 7 * release - 34 * drop - 3 * ease(after / 0.22),
      624.4 + 2 * release + 62 * fallEase - 9 * bounce,
    );
    // Поворачиваем корешок вместе с обложкой: линейное смешивание двух
    // направлений укорачивало его посередине поворота.
    const rotation = (angle - shelfTilt) / (deskTilt - shelfTilt);
    const spineAngle = mix(shelfSpineAngle, deskSpineAngle, rotation);
    const thickness = mix(shelfThickness, deskThickness, drop);
    const w = pt(Math.cos(spineAngle) * thickness, Math.sin(spineAngle) * thickness);
    const depth = ease(t / 0.9),
      d = pt(44 * depth, -28 * depth);
    const back = add(p, h),
      top = add(p, w);
    const contact = clamp((t - 0.42) / 0.5);
    if (contact) {
      ctx.save();
      ctx.translate(p.x - 16, p.y - 1);
      ctx.rotate(0.085);
      ctx.scale(1, 0.2);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 69);
      grad.addColorStop(0, 'rgba(21,37,75,' + 0.41 * contact + ')');
      grad.addColorStop(1, 'rgba(27,44,90,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(-71, -71, 142, 142);
      ctx.restore();
    }
    const rim = (pts) => {
      polygon(ctx, pts);
      ctx.strokeStyle = '#243969';
      ctx.lineWidth = 0.85;
      ctx.lineJoin = 'round';
      ctx.stroke();
    };
    if (depth > 0.001) {
      // Срез бумаги виден между двумя выступающими кромками переплёта.
      const end = [p, top, add(top, d), add(p, d)];
      polygon(ctx, end);
      ctx.fillStyle = '#deceb1';
      ctx.fill();
      for (const a of [0.22, 0.43, 0.61, 0.83]) {
        const line = lerp(p, top, a);
        ctx.strokeStyle = 'rgba(76,66,77,.62)';
        ctx.lineWidth = 0.42;
        ctx.beginPath();
        ctx.moveTo(line.x, line.y);
        ctx.lineTo(line.x + d.x, line.y + d.y);
        ctx.stroke();
      }
      rim(end);
      placeFace(ctx, media.cover, add(top, h), d, pt(-h.x, -h.y));
      rim([top, add(top, d), add(add(top, d), h), add(top, h)]);
    }
    placeFace(ctx, media.spine, back, w, pt(-h.x, -h.y));
    rim([p, top, add(top, h), back]);
  }

  function pageOutline(fn) {
    const pts = [];
    for (let i = 0; i <= 24; i++) pts.push(fn(i / 24, 0));
    for (let i = 1; i < 8; i++) pts.push(fn(1, i / 8));
    for (let i = 24; i >= 0; i--) pts.push(fn(i / 24, 1));
    return pts;
  }
  function pageMesh(t) {
    const progress = ease(t);
    const angle = (u, v) =>
      Math.PI * clamp(progress + Math.sin(Math.PI * progress) * (0.38 * u + 0.23 * v - 0.22));
    const project = (u, v) => {
      const a = angle(u, v),
        curving = Math.sin(a);
      const p = lerp(restingPage('right', u, v), restingPage('left', u, v), (1 - Math.cos(a)) / 2);
      p.y -= u * curving * (76 + 7 * v);
      p.x -= u * curving * (9 + 3 * v);
      return p;
    };
    return { project, angle };
  }
  function paintPage(t) {
    const lit = light > 0.5 ? 'lit' : 'off';
    const front = media[lit][botanical ? 'plate' : 'right'],
      back = media[lit].left;
    const { project, angle } = pageMesh(t);
    const silhouette = pageOutline(project);
    const high = Math.sin(Math.PI * t);
    if (high > 0.002) {
      ctx.save();
      const book = [...pageOutline((u, v) => restingPage('right', u, v))];
      polygon(ctx, book);
      ctx.clip();
      ctx.translate(2 * high, 6 * high);
      polygon(
        ctx,
        pageOutline((u, v) =>
          lerp(restingPage('right', u, v), restingPage('left', u, v), ease(t) * 0.86),
        ),
      );
      ctx.fillStyle = 'rgba(42,41,62,' + 0.21 * high + ')';
      ctx.shadowColor = 'rgba(47,42,60,.30)';
      ctx.shadowBlur = 4 * high;
      ctx.fill();
      ctx.restore();
    }
    // В момент перегиба проекция листа пересекает сама себя. Ближние участки
    // перекрывают дальние, поэтому рисуем ряды от дальнего края к читателю.
    const cols = 18,
      rows = 5;
    for (let row = 0; row < rows; row++) {
      const v0 = row / rows,
        v1 = (row + 1) / rows;
      for (let col = 0; col < cols; col++) {
        const u0 = col / cols,
          u1 = (col + 1) / cols;
        const corners = [
          [u0, v0],
          [u1, v0],
          [u1, v1],
          [u0, v1],
        ];
        const face = angle((u0 + u1) / 2, (v0 + v1) / 2) < Math.PI / 2 ? front : back;
        for (const ids of [
          [0, 1, 2],
          [0, 2, 3],
        ]) {
          triangle(
            ctx,
            face,
            ids.map((i) => uv(...corners[i])),
            ids.map((i) => project(...corners[i])),
            0.63,
          );
        }
      }
    }
    ctx.save();
    polygon(ctx, silhouette);
    ctx.clip();
    const spine = project(0, 0.5),
      edge = project(1, 0.5);
    if (high > 0.01 && Math.abs(edge.x - spine.x) > 1) {
      const g = ctx.createLinearGradient(spine.x, spine.y, edge.x, edge.y);
      g.addColorStop(0, 'rgba(57,48,79,' + 0.12 * high + ')');
      g.addColorStop(0.55, 'rgba(252,242,215,' + 0.07 * high + ')');
      g.addColorStop(1, 'rgba(255,248,229,' + 0.29 * high + ')');
      ctx.fillStyle = g;
      ctx.fillRect(139, 530, 300, 161);
    }
    ctx.restore();
    polygon(ctx, silhouette);
    ctx.lineWidth = 0.68;
    ctx.strokeStyle = 'rgba(55,59,94,' + 0.72 * high + ')';
    ctx.stroke();
  }
  function underPage() {
    const flat = (u, v) => restingPage('right', u, v);
    // Изменилась только печать внутри листа. Его кромка и блики сохраняются в оригинале.
    const patch = (u, v) => pt(56 + 121 * u, 18 + 106 * v);
    const dest = (u, v) => {
      const s = patch(u, v);
      return flat(s.x / W, s.y / H);
    };
    ctx.save();
    polygon(ctx, pageOutline(dest));
    ctx.clip();
    sheet(ctx, patch, dest, () => media.off.plate, 9, 2, 0.65);
    if (light > 0.001) {
      ctx.globalAlpha = light;
      sheet(ctx, patch, dest, () => media.lit.plate, 9, 2, 0.65);
    }
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(
      canvas.width / rect.width,
      0,
      0,
      canvas.height / rect.height,
      (-rect.x * canvas.width) / rect.width,
      (-rect.y * canvas.height) / rect.height,
    );
    ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
    if (!media) return;
    if (landed || fall) {
      let t = 1.7,
        opacity = 1;
      if (fall) {
        if (fall.replay && fall.time < 0.24) opacity = 1 - ease(fall.time / 0.24);
        else t = fall.time - (fall.replay ? 0.24 : 0);
      }
      ctx.save();
      ctx.globalAlpha = opacity;
      shelfGap();
      closedBook(t);
      ctx.restore();
    }
    if (turn ? !botanical : botanical) underPage();
    if (turn) paintPage(clamp(turn.time / 1.38));
  }

  function canMove() {
    return stage.dataset.moving === 'true';
  }
  function settle() {
    if (fall) {
      landed = true;
      fall = null;
    }
    if (turn) {
      botanical = !botanical;
      turn = null;
    }
    light = lightTarget;
    fadeTime = 0;
  }
  function render(now) {
    frame = 0;
    const dt = clock ? Math.min(0.075, (now - clock) / 1000) : 0;
    clock = now;
    if (canMove()) {
      if (fall) {
        fall.time += dt * fallPlaybackRate;
        if (fall.time >= 1.65 + (fall.replay ? 0.24 : 0)) {
          fall = null;
          landed = true;
        }
      }
      if (turn) {
        turn.time += dt;
        if (turn.time >= 1.38) {
          botanical = !botanical;
          turn = null;
        }
      }
      if (fadeTime > 0) {
        fadeTime = Math.max(0, fadeTime - dt);
        light = mix(lightFrom, lightTarget, ease(1 - fadeTime / 0.33));
      }
    } else settle();
    draw();
    if (fall || turn || fadeTime > 0) frame = requestAnimationFrame(render);
    else clock = 0;
  }
  function wake() {
    if (!frame) frame = requestAnimationFrame(render);
  }
  function bind(button, start, onHover) {
    let pending = false;
    async function trigger() {
      if (pending) return;
      pending = true;
      try {
        await prepareMedia();
        if (!signal.aborted) {
          start();
          wake();
        }
      } catch {
        // Форма входа и оставшаяся сцена доступны и при ошибке загрузки рисунка.
        if (!signal.aborted) mediaReady = null;
      } finally {
        pending = false;
      }
    }
    if (onHover)
      button.addEventListener(
        'pointerenter',
        (e) => {
          if (e.pointerType !== 'touch') trigger();
        },
        { signal },
      );
    button.addEventListener(
      'click',
      (e) => {
        if (
          !onHover ||
          !e.detail ||
          e.pointerType === 'touch' ||
          !matchMedia('(hover: hover)').matches
        )
          trigger();
      },
      { signal },
    );
  }
  function imageOf(node) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = node.getAttribute('href');
    });
  }
  let mediaReady = null;
  function prepareMedia() {
    mediaReady ??= Promise.all([...stage.querySelectorAll('#artwork image')].map(imageOf)).then(
      ([base, warm]) => {
        if (signal.aborted) return;
        const combined = surface(1254, 1254),
          g = combined.getContext('2d');
        g.drawImage(base, 0, 0);
        g.drawImage(warm, 0, 510);
        function pages(img, lit) {
          const right = extractPage(img, 'right');
          return { right, left: extractPage(img, 'left'), plate: botanicalPlate(right, lit) };
        }
        const wood = surface(29, 38),
          wg = wood.getContext('2d');
        for (let y = 0; y < 2; y++)
          for (let x = 0; x < 2; x++) {
            wg.save();
            wg.translate(x ? 29 : 0, y ? 38 : 0);
            wg.scale(x ? -1 : 1, y ? -1 : 1);
            wg.drawImage(
              base,
              741 * sceneScale,
              607 * sceneScale,
              14.5 * sceneScale,
              19 * sceneScale,
              0,
              0,
              14.5,
              19,
            );
            wg.restore();
          }
        media = {
          wood: ctx.createPattern(wood, 'repeat'),
          spine: sampleSpine(base),
          cover: paintCloth(),
          off: pages(base, false),
          lit: pages(combined, true),
        };
      },
    );
    return mediaReady;
  }
  bind(
    shelfButton,
    () => {
      if (!fall) fall = { time: 0, replay: landed };
    },
    false,
  );
  bind(
    pageButton,
    () => {
      if (!turn) turn = { time: 0 };
    },
    true,
  );
  lamp.addEventListener(
    'click',
    () => {
      lightFrom = light;
      lightTarget = Number(lamp.getAttribute('aria-pressed') === 'true');
      fadeTime = 0.33;
      wake();
    },
    { signal },
  );
  stage.addEventListener(
    'scene-motion',
    () => {
      if (!canMove()) {
        settle();
        draw();
      }
      clock = 0;
    },
    { signal },
  );
  const size = new ResizeObserver(() => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    draw();
  });
  size.observe(canvas);
  signal.addEventListener(
    'abort',
    () => {
      size.disconnect();
      cancelAnimationFrame(frame);
    },
    { once: true },
  );
}
