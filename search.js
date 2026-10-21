const form = document.querySelector(".finder");
const input = document.querySelector("#photo-query");
const status = document.querySelector(".finder-status");
const grid = document.querySelector(".photos");

if (form && input && status && grid) {
  const figures = [...grid.querySelectorAll("figure[data-id]")];
  const byId = new Map(figures.map((figure) => [figure.dataset.id, figure]));
  let index = null;
  let indexPromise = null;
  let extractorPromise = null;
  let requestId = 0;
  let timer = 0;
  let shown = null;

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const narrow = window.matchMedia("(max-width: 799px)");

  function dot(a, b) {
    let sum = 0;
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i++) sum += a[i] * b[i];
    return sum;
  }

  function scoreOf(vector, photo) {
    let score = -1;
    for (const embedding of photo.embeddings) {
      const next = dot(vector, embedding);
      if (next > score) score = next;
    }
    return score;
  }

  function words(phrase) {
    return phrase.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }

  function prefixIds(query) {
    if (!index || query.length < 3) return [];
    const ids = [];
    for (const figure of figures) {
      const photo = index.byId.get(figure.dataset.id);
      if (!photo || !photo.phrases) continue;
      const hit = photo.phrases.some((phrase) => {
        const text = phrase.toLowerCase();
        if (text.startsWith(query)) return true;
        return words(phrase).some((word) => word.startsWith(query));
      });
      if (hit) ids.push(figure.dataset.id);
    }
    return ids;
  }

  function incomplete(query, ids) {
    const wanted = new Set(ids);
    for (const photo of index.photos) {
      if (!wanted.has(photo.id) || !photo.phrases) continue;
      for (const phrase of photo.phrases) {
        if (phrase.toLowerCase() === query) return false;
        if (words(phrase).includes(query)) return false;
      }
    }
    return true;
  }

  function semanticIds(vector) {
    const scored = figures.map((figure, order) => {
      const photo = index.byId.get(figure.dataset.id);
      return { id: figure.dataset.id, order, score: photo ? scoreOf(vector, photo) : -1 };
    });
    scored.sort((a, b) => b.score - a.score || a.order - b.order);
    const top = scored[0] ? scored[0].score : 0;
    if (top < index.minScore) return [];
    const floor = top >= index.tightAt ? index.tightScore : index.minScore;
    return scored.filter((item, i) => i === 0 || item.score >= floor).map((item) => item.id);
  }

  function shape(count) {
    const slim = narrow.matches;
    if (count <= 1) return [1, 1];
    if (count === 2) return slim ? [1, 2] : [2, 1];
    if (count === 3) return slim ? [2, 2] : [3, 1];
    if (count === 4) return [2, 2];
    if (count <= 6) return slim ? [2, 3] : [3, 2];
    if (count <= 8) return slim ? [2, 4] : [4, 2];
    return slim ? [3, 4] : [4, 3];
  }

  function same(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    const set = new Set(a);
    return b.every((id) => set.has(id));
  }

  function announce(ids) {
    if (!ids || !ids.length) {
      status.textContent = "";
      return;
    }
    const names = ids.map((id) => {
      const caption = byId.get(id).querySelector("figcaption");
      return caption ? caption.textContent : id;
    });
    status.textContent = names.length < 4 ? names.join(", ") : names.length + " photos";
  }

  let resting = null;

  function px(n) {
    return Math.round(n * 100) / 100;
  }

  function ratioOf(figure) {
    const img = figure.querySelector("img");
    if (!img || !img.naturalWidth || !img.naturalHeight) return 0;
    return img.naturalWidth / img.naturalHeight;
  }

  function slots(count, gap, pad) {
    const host = grid.getBoundingClientRect();
    if (host.width < 8 || host.height < 8) return null;
    const [cols, rows] = shape(count);
    const innerW = host.width - pad * 2;
    const innerH = host.height - pad * 2;
    if (innerW < 40 || innerH < 40) return null;
    const cellW = (innerW - gap * (cols - 1)) / cols;
    const cellH = (innerH - gap * (rows - 1)) / rows;
    const frames = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      frames.push({
        left: pad + col * (cellW + gap),
        top: pad + row * (cellH + gap),
        width: cellW,
        height: cellH
      });
    }
    return frames;
  }

  function fit(slot, ratio) {
    if (!ratio) return slot;
    let width = slot.width;
    let height = width / ratio;
    if (height > slot.height) {
      height = slot.height;
      width = height * ratio;
    }
    return {
      left: slot.left + (slot.width - width) / 2,
      top: slot.top + (slot.height - height) / 2,
      width,
      height
    };
  }

  function overviewRects() {
    const frames = slots(figures.length, 4, 0);
    if (!frames) return null;
    const rects = new Map();
    figures.forEach((figure, i) => {
      rects.set(figure, {
        left: frames[i].left,
        top: frames[i].top,
        width: frames[i].width,
        height: frames[i].height,
        show: true
      });
    });
    return rects;
  }

  function focusRects(ids) {
    const sheet = overviewRects();
    if (!sheet) return null;
    const few = ids.length <= 2;
    const frames = slots(ids.length, few ? 16 : 8, few ? 18 : 10);
    if (!frames) return null;
    const rects = new Map();
    const visible = new Set(ids);
    for (const figure of figures) {
      const home = sheet.get(figure);
      if (visible.has(figure.dataset.id)) continue;
      rects.set(figure, {
        left: home.left,
        top: home.top,
        width: home.width,
        height: home.height,
        show: false
      });
    }
    ids.forEach((id, i) => {
      const figure = byId.get(id);
      if (!figure) return;
      const frame = few ? fit(frames[i], ratioOf(figure)) : frames[i];
      rects.set(figure, {
        left: frame.left,
        top: frame.top,
        width: frame.width,
        height: frame.height,
        show: true
      });
    });
    return rects;
  }

  function writeBox(figure, rect) {
    figure.style.left = px(rect.left) + "px";
    figure.style.top = px(rect.top) + "px";
    figure.style.width = px(rect.width) + "px";
    figure.style.height = px(rect.height) + "px";
  }

  function shifted(a, b) {
    return Math.abs(a.left - b.left) > 0.5
      || Math.abs(a.top - b.top) > 0.5
      || Math.abs(a.width - b.width) > 0.5
      || Math.abs(a.height - b.height) > 0.5;
  }

  function paint(rects) {
    for (const figure of figures) {
      const rect = rects.get(figure);
      const traveling = rect.show && resting && shifted(resting.get(figure), rect);
      writeBox(figure, rect);
      figure.classList.toggle("is-out", !rect.show);
      figure.classList.toggle("is-on", rect.show);
      figure.style.zIndex = !rect.show ? "0" : traveling ? "3" : "1";
      figure.setAttribute("aria-hidden", rect.show ? "false" : "true");
    }
    resting = rects;
  }

  function place(rects, animate) {
    const reduce = !animate || motion.matches;
    if (reduce || !resting) {
      grid.classList.add("is-instant");
      paint(rects);
      grid.offsetWidth;
      grid.classList.remove("is-instant");
      return;
    }
    const host = grid.getBoundingClientRect();
    grid.classList.add("is-instant");
    for (const figure of figures) {
      const box = figure.getBoundingClientRect();
      writeBox(figure, {
        left: box.left - host.left,
        top: box.top - host.top,
        width: box.width,
        height: box.height
      });
    }
    grid.offsetWidth;
    grid.classList.remove("is-instant");
    grid.offsetWidth;
    paint(rects);
  }

  function present(ids, animate) {
    if (same(shown, ids) && animate !== false) return;
    shown = ids ? ids.slice() : null;
    const focus = !!(shown && shown.length);
    const rects = focus ? focusRects(shown) : overviewRects();
    if (!rects) return;
    grid.classList.toggle("is-focus", focus);
    grid.classList.toggle("is-group", focus && shown.length > 2);
    grid.classList.add("is-ready");
    place(rects, animate !== false);
    announce(focus ? shown : null);
  }

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch("data/photo-embeddings.json")
        .then((res) => {
          if (!res.ok) throw new Error("index");
          return res.json();
        })
        .then((data) => {
          data.byId = new Map(data.photos.map((photo) => [photo.id, photo]));
          index = data;
          return data;
        })
        .catch((error) => {
          indexPromise = null;
          throw error;
        });
    }
    return indexPromise;
  }

  function loadExtractor(model, dtype) {
    if (!extractorPromise) {
      extractorPromise = import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1")
        .then(({ pipeline, env }) => {
          env.allowLocalModels = false;
          const wasm = env.backends && env.backends.onnx && env.backends.onnx.wasm;
          if (wasm) wasm.numThreads = 1;
          return pipeline("feature-extraction", model, { dtype });
        })
        .catch((error) => {
          extractorPromise = null;
          throw error;
        });
    }
    return extractorPromise;
  }

  async function search(text, id) {
    try {
      const data = await loadIndex();
      if (id !== requestId) return;
      const extractor = await loadExtractor(data.model, data.dtype);
      if (id !== requestId) return;
      const output = await extractor(text, { pooling: "mean", normalize: true });
      if (id !== requestId) return;
      const ids = semanticIds(Array.from(output.data));
      if (ids.length) present(ids);
      else if (!prefixIds(text).length) present(null);
    } catch (error) {
      if (id !== requestId) return;
      status.textContent = "Search is unavailable right now.";
    }
  }

  function run(text) {
    window.clearTimeout(timer);
    requestId += 1;
    const id = requestId;
    const query = text.toLowerCase().trim().replace(/\s+/g, " ");
    if (!index) {
      loadIndex()
        .then(() => {
          if (input.value.toLowerCase().trim().replace(/\s+/g, " ") === query) run(query);
        })
        .catch(() => {
          status.textContent = "Search is unavailable right now.";
        });
      return;
    }
    if (query.length < 3) {
      present(null);
      return;
    }
    const lexical = prefixIds(query);
    if (lexical.length && incomplete(query, lexical)) {
      present(lexical);
      return;
    }
    if (lexical.length) present(lexical);
    else present(null);
    timer = window.setTimeout(() => search(query, id), 140);
  }

  function settle() {
    if (!grid.getBoundingClientRect().height) {
      requestAnimationFrame(settle);
      return;
    }
    present(shown, false);
  }

  for (const figure of figures) {
    const img = figure.querySelector("img");
    if (!img || img.complete) continue;
    img.addEventListener("load", () => {
      if (shown && shown.length <= 2 && shown.includes(figure.dataset.id)) present(shown, false);
    });
  }

  settle();

  loadIndex().catch(() => {});

  input.addEventListener("input", () => run(input.value));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    window.clearTimeout(timer);
    const query = input.value.toLowerCase().trim().replace(/\s+/g, " ");
    run(query);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    input.value = "";
    requestId += 1;
    window.clearTimeout(timer);
    present(null);
  });

  grid.addEventListener("click", (event) => {
    const figure = event.target.closest("figure");
    if (!figure || figure.classList.contains("is-out")) return;
    requestId += 1;
    window.clearTimeout(timer);
    if (shown && shown.length === 1 && shown[0] === figure.dataset.id) {
      input.value = "";
      present(null);
      return;
    }
    input.value = "";
    present([figure.dataset.id]);
  });

  window.addEventListener("resize", () => present(shown, false));
}
