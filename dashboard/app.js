/* Dashboard de churn — gráficos con D3 v7.
   Los datos vienen de data.js (generado por exportar_datos_web.R). */
(function () {
  "use strict";
  const D = window.CHURN_DATA;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- formato numérico en español ---
  const loc = d3.formatLocale({ decimal: ".", thousands: ",", grouping: [3], currency: ["$", ""] });
  const fInt = loc.format(",.0f");
  const fPct = loc.format(".1%");
  const fPct0 = loc.format(".0%");
  const fUsd = loc.format("$,.2f");
  const fUsd0 = loc.format("$,.0f");
  const fDec = (n, d) => loc.format(`.${d}f`)(n);

  // --- utilidades ---
  const tip = document.getElementById("tip");
  function showTip(event, rows) {
    tip.replaceChildren();
    rows.forEach((r) => {
      const div = document.createElement("div");
      if (r.key) {
        div.className = "t-row";
        const k = document.createElement("i");
        k.className = "key";
        k.style.background = r.key;
        div.appendChild(k);
      }
      const s = document.createElement("span");
      s.className = r.strong ? "t-val" : "t-lbl";
      s.textContent = r.text;
      div.appendChild(s);
      tip.appendChild(div);
    });
    tip.style.opacity = 1;
    moveTip(event);
  }
  function moveTip(event) {
    let x, y;
    if (event.clientX !== undefined && event.type !== "focus") {
      x = event.clientX; y = event.clientY;
    } else {
      const r = event.target.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top;
    }
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + 14, top = y - h - 10;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (left < 8) left = 8;
    if (top < 60) top = y + 18;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() { tip.style.opacity = 0; }

  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ancho de texto (para reservar espacio a las etiquetas)
  const ctx = document.createElement("canvas").getContext("2d");
  function textW(s, size = 13, weight = 400) {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    return ctx.measureText(s).width;
  }

  // barra horizontal con extremo de datos redondeado (4px) y base recta
  function barPath(x0, x1, y, h) {
    const w = Math.abs(x1 - x0);
    if (w < 0.5) return `M${x0},${y}h0v${h}h0Z`;
    const r = Math.min(4, w, h / 2);
    if (x1 >= x0) {
      return `M${x0},${y}H${x1 - r}A${r},${r} 0 0 1 ${x1},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x1 - r},${y + h}H${x0}Z`;
    }
    return `M${x0},${y}H${x1 + r}A${r},${r} 0 0 0 ${x1},${y + r}V${y + h - r}A${r},${r} 0 0 0 ${x1 + r},${y + h}H${x0}Z`;
  }

  const dur = (ms) => (reduceMotion ? 0 : ms);

  /* ----------------------------------------------------------------
     Barras horizontales genéricas.
     rows: [{label, value, tip: [...]}]
     opts: {max, fmt, cls, animate, ticks, tickFmt}
     En pantallas angostas la etiqueta va arriba de la barra.
  ---------------------------------------------------------------- */
  function hbar(el, rows, opts) {
    const W = el.clientWidth;
    const fmt = opts.fmt || fPct;
    const maxLbl = d3.max(rows, (d) => textW(d.label));
    const valW = d3.max(rows, (d) => textW(fmt(d.value), 13, 600)) + 10;
    const stacked = maxLbl > W * 0.42;
    const barH = 20;
    const lblW = stacked ? 0 : maxLbl + 12;
    const rowH = stacked ? barH + 30 : barH + 14;
    const top = 4, axisH = 20;
    const H = top + rows.length * rowH + axisH;
    const plotW = Math.max(40, W - lblW - valW);
    const x = d3.scaleLinear().domain([0, opts.max ?? d3.max(rows, (d) => d.value)]).nice(4).range([0, plotW]);

    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H)
      .attr("role", "img").attr("aria-label", opts.aria || "");
    const g = svg.append("g").attr("transform", `translate(${lblW},${top})`);
    const plotH = rows.length * rowH;

    const ticks = x.ticks(4);
    g.selectAll(".gridline").data(ticks).join("line").attr("class", "gridline")
      .attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", plotH);
    g.selectAll(".tick").data(ticks).join("text").attr("class", "tick")
      .attr("x", x).attr("y", plotH + 15).attr("text-anchor", "middle")
      .text(opts.tickFmt || (opts.fmt === fInt ? fInt : fPct0));
    g.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", plotH);

    const row = g.selectAll(".row").data(rows).join("g").attr("class", "row")
      .attr("transform", (d, i) => `translate(0,${i * rowH})`)
      .attr("tabindex", 0)
      .on("pointerenter pointermove focus", (e, d) => showTip(e, d.tip))
      .on("pointerleave blur", hideTip);

    const by = stacked ? 22 : (rowH - barH) / 2;
    row.append("rect").attr("class", "hit").attr("x", -lblW).attr("y", 0).attr("width", lblW + plotW + valW).attr("height", rowH);
    row.append("text").attr("class", "lbl")
      .attr("x", stacked ? 0 : -10).attr("y", stacked ? 15 : by + barH / 2 + 4.5)
      .attr("text-anchor", stacked ? "start" : "end").text((d) => d.label);
    const bar = row.append("path").attr("class", (d) => "bar " + (d.cls || opts.cls || ""));
    const val = row.append("text").attr("class", "val").attr("y", by + barH / 2 + 4.5).text((d) => fmt(d.value));

    if (opts.animate) {
      bar.attr("d", () => barPath(0, 0, by, barH))
        .transition().duration(dur(900)).delay((d, i) => dur(i * 70)).ease(d3.easeCubicOut)
        .attrTween("d", (d) => (t) => barPath(0, x(d.value) * t, by, barH));
      val.attr("x", 6).attr("opacity", 0)
        .transition().duration(dur(900)).delay((d, i) => dur(i * 70)).ease(d3.easeCubicOut)
        .attr("x", (d) => x(d.value) + 6).attr("opacity", 1);
    } else {
      bar.attr("d", (d) => barPath(0, x(d.value), by, barH));
      val.attr("x", (d) => x(d.value) + 6);
    }
  }

  // tasa de churn por nivel → filas para hbar
  function tasaRows(list, variable) {
    return list.filter((d) => d.variable === variable)
      .sort((a, b) => b.tasa - a.tasa)
      .map((d) => ({
        label: d.nivel, value: d.tasa,
        tip: [{ text: fPct(d.tasa), strong: true }, { text: `${d.etiqueta}: ${d.nivel}` }, { text: `${fInt(d.clientes)} customers` }],
      }));
  }

  // paneles pequeños (2×2) con la misma escala
  function facets(el, list, animate) {
    const vars = [...new Set(list.map((d) => d.variable))];
    const max = d3.max(list, (d) => d.tasa);
    const wrap = document.createElement("div");
    wrap.className = "grid g2";
    wrap.style.gap = "28px 32px";
    el.appendChild(wrap);
    vars.forEach((v) => {
      const box = document.createElement("div");
      const h = document.createElement("h4");
      h.textContent = list.find((d) => d.variable === v).etiqueta;
      h.style.cssText = "margin:0 0 8px;font-size:14px;font-weight:600";
      const c = document.createElement("div");
      c.className = "chart";
      box.append(h, c);
      wrap.appendChild(box);
      hbar(c, tasaRows(list, v), { max, animate, aria: `Churn rate by ${h.textContent}` });
    });
  }

  /* ------------------------- gráficos ------------------------- */
  const clientes = D.clientes.map((r) => ({ t: r[0], m: r[1], c: r[2] }));
  const estadoLbl = (c) => (c ? "Churned" : "Active");

  const charts = {
    "c-estado"(el, animate) {
      const n1 = D.kpis.bajas, n0 = D.kpis.clientes - n1;
      const rows = [
        { label: "Active", value: n0, cls: "" },
        { label: "Churned", value: n1, cls: "s2" },
      ].map((d) => ({ ...d, tip: [{ text: fInt(d.value), strong: true }, { text: `${d.label} · ${fPct(d.value / D.kpis.clientes)} of total` }] }));
      hbar(el, rows, { fmt: (v) => `${fInt(v)} · ${fPct0(v / D.kpis.clientes)}`, tickFmt: (v) => (v >= 1000 ? fInt(v / 1000) + "K" : v), animate, aria: "Customers by status" });
    },

    "c-box"(el, animate) {
      const W = el.clientWidth;
      const panels = [
        { key: "t", title: "Tenure (months)", fmt: (v) => fDec(v, 0) },
        { key: "m", title: "Monthly charges ($)", fmt: (v) => fUsd(v) },
      ];
      const lblW = Math.min(110, textW("Churned") + 14);
      const boxH = 26, rowH = 46, panelH = 2 * rowH + 50;
      const svg = d3.select(el).append("svg").attr("width", W).attr("height", panelH * 2)
        .attr("role", "img").attr("aria-label", "Distribution of tenure and monthly charges by status");
      panels.forEach((p, pi) => {
        const g = svg.append("g").attr("transform", `translate(${lblW},${pi * panelH + 18})`);
        const plotW = W - lblW - 8;
        const vals = clientes.map((d) => d[p.key]);
        const x = d3.scaleLinear().domain(d3.extent(vals)).nice().range([0, plotW]);
        g.append("text").attr("class", "lbl").attr("x", -lblW).attr("y", -4).style("font-weight", 600).style("fill", "var(--ink)").text(p.title);
        const ticks = x.ticks(5);
        g.selectAll(".gridline").data(ticks).join("line").attr("class", "gridline")
          .attr("x1", x).attr("x2", x).attr("y1", 6).attr("y2", 2 * rowH + 6);
        g.selectAll(".tick").data(ticks).join("text").attr("class", "tick").attr("x", x).attr("y", 2 * rowH + 22)
          .attr("text-anchor", "middle").text((v) => fInt(v));
        [0, 1].forEach((c, i) => {
          const s = clientes.filter((d) => d.c === c).map((d) => d[p.key]).sort(d3.ascending);
          const q1 = d3.quantile(s, 0.25), med = d3.quantile(s, 0.5), q3 = d3.quantile(s, 0.75);
          const iqr = q3 - q1;
          const lo = d3.min(s.filter((v) => v >= q1 - 1.5 * iqr));
          const hi = d3.max(s.filter((v) => v <= q3 + 1.5 * iqr));
          const y = 6 + i * rowH + (rowH - boxH) / 2, cy = y + boxH / 2;
          const row = g.append("g").attr("class", "row").attr("tabindex", 0)
            .on("pointerenter pointermove focus", (e) => showTip(e, [
              { text: `Median ${p.fmt(med)}`, strong: true },
              { text: `${estadoLbl(c)} · ${p.title}` },
              { text: `Middle 50%: ${p.fmt(q1)} – ${p.fmt(q3)}` },
              { text: `Range (excl. outliers): ${p.fmt(lo)} – ${p.fmt(hi)}` },
            ]))
            .on("pointerleave blur", hideTip);
          row.append("rect").attr("class", "hit").attr("x", -lblW).attr("y", y - 8).attr("width", lblW + plotW).attr("height", boxH + 16);
          row.append("text").attr("class", "lbl").attr("x", -10).attr("y", cy + 4.5).attr("text-anchor", "end").text(estadoLbl(c));
          const parts = row.append("g");
          parts.append("line").attr("class", "whisker").attr("x1", x(lo)).attr("x2", x(q1)).attr("y1", cy).attr("y2", cy);
          parts.append("line").attr("class", "whisker").attr("x1", x(q3)).attr("x2", x(hi)).attr("y1", cy).attr("y2", cy);
          parts.append("line").attr("class", "whisker").attr("x1", x(lo)).attr("x2", x(lo)).attr("y1", cy - 6).attr("y2", cy + 6);
          parts.append("line").attr("class", "whisker").attr("x1", x(hi)).attr("x2", x(hi)).attr("y1", cy - 6).attr("y2", cy + 6);
          parts.append("rect").attr("class", "box" + (c ? " s2" : "")).attr("x", x(q1)).attr("width", Math.max(1, x(q3) - x(q1)))
            .attr("y", y).attr("height", boxH).attr("rx", 4);
          parts.append("line").attr("class", "median").attr("x1", x(med)).attr("x2", x(med)).attr("y1", y).attr("y2", y + boxH);
          if (animate) {
            parts.attr("opacity", 0).attr("transform", `translate(0,0) scale(1,1)`)
              .transition().duration(dur(700)).delay(dur(pi * 200 + i * 120)).attr("opacity", 1);
          }
        });
      });
    },

    "c-contract"(el, a) { hbar(el, tasaRows(D.contrato_facturacion, "contract"), { animate: a, aria: "Churn rate by contract" }); },
    "c-payment"(el, a) { hbar(el, tasaRows(D.contrato_facturacion, "payment_method"), { animate: a, aria: "Churn rate by payment method" }); },
    "c-internet"(el, a) { hbar(el, tasaRows(D.contrato_facturacion, "internet_service"), { animate: a, aria: "Churn rate by internet service" }); },

    "c-scatter"(el, animate) {
      const W = el.clientWidth, H = Math.round(Math.min(380, Math.max(260, W * 0.62)));
      const m = { t: 8, r: 8, b: 40, l: 44 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const x = d3.scaleLinear().domain([0, 72]).range([0, iw]);
      const y = d3.scaleLinear().domain([0, 125]).range([ih, 0]);
      const svg = d3.select(el).append("svg").attr("width", W).attr("height", H)
        .attr("role", "img").attr("aria-label", "Monthly charges vs. tenure, colored by status");
      const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
      g.selectAll(".gx").data(x.ticks(6)).join("line").attr("class", "gridline").attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", ih);
      g.selectAll(".gy").data(y.ticks(5)).join("line").attr("class", "gridline").attr("y1", y).attr("y2", y).attr("x1", 0).attr("x2", iw);
      g.selectAll(".tx").data(x.ticks(6)).join("text").attr("class", "tick").attr("x", x).attr("y", ih + 16).attr("text-anchor", "middle").text((v) => v);
      g.selectAll(".ty").data(y.ticks(5)).join("text").attr("class", "tick").attr("x", -8).attr("y", (v) => y(v) + 4).attr("text-anchor", "end").text((v) => v);
      g.append("text").attr("class", "axis-title").attr("x", iw / 2).attr("y", ih + 34).attr("text-anchor", "middle").text("Tenure (months)");
      g.append("text").attr("class", "axis-title").attr("transform", `translate(-34,${ih / 2}) rotate(-90)`).attr("text-anchor", "middle").text("Monthly charges ($)");

      const r = W < 480 ? 1.8 : 2.4;
      const dots = g.append("g").selectAll("circle").data(clientes).join("circle")
        .attr("class", (d) => (d.c ? "dot-b" : "dot-a"))
        .attr("cx", (d) => x(d.t)).attr("cy", (d) => y(d.m)).attr("r", r)
        .attr("opacity", 0);
      const filt = el._filter || "all";
      const target = (d) => (filt === "all" || String(d.c) === filt ? 0.45 : 0.04);
      if (animate) dots.transition().duration(dur(800)).delay((d) => dur(d.t * 8)).attr("opacity", target);
      else dots.attr("opacity", target);

      const ring = g.append("circle").attr("class", "hover-ring").attr("r", 6).attr("opacity", 0);
      const visible = clientes.filter((d) => filt === "all" || String(d.c) === filt);
      const delaunay = d3.Delaunay.from(visible, (d) => x(d.t), (d) => y(d.m));
      g.append("rect").attr("width", iw).attr("height", ih).attr("fill", "transparent")
        .on("pointermove", (e) => {
          const [px, py] = d3.pointer(e);
          const i = delaunay.find(px, py);
          const d = visible[i];
          if (!d || Math.hypot(x(d.t) - px, y(d.m) - py) > 24) { ring.attr("opacity", 0); hideTip(); return; }
          ring.attr("cx", x(d.t)).attr("cy", y(d.m)).attr("opacity", 1);
          showTip(e, [
            { text: fUsd(d.m) + " / month", strong: true },
            { text: estadoLbl(d.c), key: cssVar(d.c ? "--s2" : "--s1") },
            { text: `${d.t} months of tenure` },
          ]);
        })
        .on("pointerleave", () => { ring.attr("opacity", 0); hideTip(); });
    },

    "c-servicios"(el, a) { facets(el, D.servicios, a); },
    "c-demo"(el, a) { facets(el, D.demografia, a); },

    "c-motivos"(el, a) {
      const total = d3.sum(D.motivos, (d) => d.n);
      const rows = D.motivos.map((d) => ({
        label: d.motivo, value: d.n,
        tip: [{ text: `${fInt(d.n)} customers`, strong: true }, { text: d.motivo }, { text: `${fPct(d.n / total)} of churners` }],
      }));
      hbar(el, rows, { fmt: fInt, animate: a, aria: "Churn reasons" });
    },

    "c-roc"(el, animate) {
      const W = el.clientWidth, H = Math.min(W, 380);
      const m = { t: 8, r: 12, b: 40, l: 44 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const x = d3.scaleLinear().domain([0, 1]).range([0, iw]);
      const y = d3.scaleLinear().domain([0, 1]).range([ih, 0]);
      const roc = D.modelo.roc;
      const svg = d3.select(el).append("svg").attr("width", W).attr("height", H)
        .attr("role", "img").attr("aria-label", `ROC curve, AUC ${fDec(D.modelo.auc, 3)}`);
      const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
      const tk = [0, 0.25, 0.5, 0.75, 1];
      g.selectAll(".gx").data(tk).join("line").attr("class", "gridline").attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", ih);
      g.selectAll(".gy").data(tk).join("line").attr("class", "gridline").attr("y1", y).attr("y2", y).attr("x1", 0).attr("x2", iw);
      g.selectAll(".tx").data(tk).join("text").attr("class", "tick").attr("x", x).attr("y", ih + 16).attr("text-anchor", "middle").text(fPct0);
      g.selectAll(".ty").data(tk).join("text").attr("class", "tick").attr("x", -8).attr("y", (v) => y(v) + 4).attr("text-anchor", "end").text(fPct0);
      g.append("text").attr("class", "axis-title").attr("x", iw / 2).attr("y", ih + 34).attr("text-anchor", "middle").text("False positive rate (1 − specificity)");
      g.append("text").attr("class", "axis-title").attr("transform", `translate(-34,${ih / 2}) rotate(-90)`).attr("text-anchor", "middle").text("Sensitivity");
      g.append("line").attr("class", "diag").attr("x1", 0).attr("y1", ih).attr("x2", iw).attr("y2", 0);

      const area = d3.area().x((d) => x(d.fpr)).y0(ih).y1((d) => y(d.tpr));
      const line = d3.line().x((d) => x(d.fpr)).y((d) => y(d.tpr));
      g.append("path").datum(roc).attr("class", "roc-area").attr("d", area).attr("opacity", animate ? 0 : 1)
        .transition().duration(dur(600)).delay(dur(700)).attr("opacity", 1);
      const path = g.append("path").datum(roc).attr("class", "roc-line").attr("d", line);
      if (animate && !reduceMotion) {
        const L = path.node().getTotalLength();
        path.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L)
          .transition().duration(1200).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0)
          .on("end", () => path.attr("stroke-dasharray", null));
      }
      g.append("text").attr("class", "val").attr("x", x(0.55)).attr("y", y(0.32)).style("font-size", "15px").text(`AUC = ${fDec(D.modelo.auc, 3)}`);

      // umbral operativo
      const ux = 1 - D.modelo.especificidad, uy = D.modelo.sensibilidad;
      g.append("circle").attr("class", "marker").attr("cx", x(ux)).attr("cy", y(uy)).attr("r", 6)
        .attr("opacity", animate ? 0 : 1).transition().delay(dur(1200)).duration(dur(300)).attr("opacity", 1);
      g.append("text").attr("class", "lbl").attr("x", x(ux) + 10).attr("y", y(uy) + 16).text(`Threshold ${fDec(D.modelo.umbral, 3)}`);

      // crosshair
      const ch = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", ih).attr("opacity", 0);
      const dot = g.append("circle").attr("r", 5).attr("class", "marker").style("fill", "var(--s1)").attr("opacity", 0);
      const bis = d3.bisector((d) => d.fpr).center;
      g.append("rect").attr("width", iw).attr("height", ih).attr("fill", "transparent")
        .on("pointermove", (e) => {
          const [px] = d3.pointer(e);
          const d = roc[bis(roc, x.invert(px))];
          ch.attr("x1", x(d.fpr)).attr("x2", x(d.fpr)).attr("opacity", 1);
          dot.attr("cx", x(d.fpr)).attr("cy", y(d.tpr)).attr("opacity", 1);
          showTip(e, [{ text: `Sensitivity ${fPct(d.tpr)}`, strong: true }, { text: `False positive rate ${fPct(d.fpr)}` }]);
        })
        .on("pointerleave", () => { ch.attr("opacity", 0); dot.attr("opacity", 0); hideTip(); });
    },

    "c-coef"(el, animate) {
      const rows = D.modelo.coeficientes;
      const W = el.clientWidth;
      const maxLbl = d3.max(rows, (d) => textW(d.variable));
      const stacked = maxLbl > W * 0.45;
      const lblW = stacked ? 0 : maxLbl + 12;
      const barH = 20, rowH = stacked ? barH + 30 : barH + 14, axisH = 20;
      const H = rows.length * rowH + axisH + 4;
      const ext = d3.max(rows, (d) => Math.abs(d.estimado));
      const pad = textW("−0,00", 13, 600) + 8;
      const x = d3.scaleLinear().domain([-ext, ext]).nice().range([pad, W - lblW - pad]);
      const svg = d3.select(el).append("svg").attr("width", W).attr("height", H)
        .attr("role", "img").attr("aria-label", "Significant logistic regression coefficients");
      const g = svg.append("g").attr("transform", `translate(${lblW},4)`);
      const plotH = rows.length * rowH;
      const ticks = x.ticks(5);
      g.selectAll(".gridline").data(ticks).join("line").attr("class", "gridline").attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", plotH);
      g.selectAll(".tick").data(ticks).join("text").attr("class", "tick").attr("x", x).attr("y", plotH + 15).attr("text-anchor", "middle").text((v) => fDec(v, 1));
      g.append("line").attr("class", "zero").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", plotH);

      const row = g.selectAll(".row").data(rows).join("g").attr("class", "row").attr("tabindex", 0)
        .attr("transform", (d, i) => `translate(0,${i * rowH})`)
        .on("pointerenter pointermove focus", (e, d) => {
          const or = Math.exp(d.estimado);
          const efecto = or >= 1 ? `multiplies the odds of churn × ${fDec(or, 2)}` : `lowers the odds of churn by ${fPct0(1 - or)}`;
          showTip(e, [{ text: `Coef. ${fDec(d.estimado, 3)}`, strong: true }, { text: d.variable }, { text: efecto },
            { text: d.variable.startsWith("Tenure") ? "(per additional month)" : "(vs. the reference category)" }]);
        })
        .on("pointerleave blur", hideTip);
      const by = stacked ? 22 : (rowH - barH) / 2;
      row.append("rect").attr("class", "hit").attr("x", -lblW).attr("width", W).attr("height", rowH);
      row.append("text").attr("class", "lbl").attr("x", stacked ? 0 : -10).attr("y", stacked ? 15 : by + barH / 2 + 4.5)
        .attr("text-anchor", stacked ? "start" : "end").text((d) => d.variable);
      const bar = row.append("path").attr("class", (d) => "bar " + (d.estimado > 0 ? "up" : "down"));
      const val = row.append("text").attr("class", "val").attr("y", by + barH / 2 + 4.5)
        .attr("text-anchor", (d) => (d.estimado > 0 ? "start" : "end")).text((d) => fDec(d.estimado, 2));
      const vx = (d) => x(d.estimado) + (d.estimado > 0 ? 6 : -6);
      if (animate) {
        bar.attr("d", () => barPath(x(0), x(0), by, barH)).transition().duration(dur(900)).delay((d, i) => dur(i * 70)).ease(d3.easeCubicOut)
          .attrTween("d", (d) => (t) => barPath(x(0), x(0) + (x(d.estimado) - x(0)) * t, by, barH));
        val.attr("x", x(0)).attr("opacity", 0).transition().duration(dur(900)).delay((d, i) => dur(i * 70)).attr("x", vx).attr("opacity", 1);
      } else {
        bar.attr("d", (d) => barPath(x(0), x(d.estimado), by, barH));
        val.attr("x", vx);
      }
    },
  };

  /* --------- render perezoso: cada gráfico se dibuja al entrar en pantalla --------- */
  const rendered = new Set();
  function draw(id, animate) {
    const el = document.getElementById(id);
    if (!el || !el.clientWidth) return;
    el.replaceChildren();
    charts[id](el, animate);
    rendered.add(id);
  }
  const chartObs = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting && !rendered.has(en.target.id)) {
        draw(en.target.id, true);
        chartObs.unobserve(en.target);
      }
    });
  }, { threshold: 0.25 });
  Object.keys(charts).forEach((id) => chartObs.observe(document.getElementById(id)));

  // aparición suave de las tarjetas
  const revObs = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); revObs.unobserve(en.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll(".reveal").forEach((n) => revObs.observe(n));

  // redibujar al cambiar el ancho (sin animación)
  let lastW = window.innerWidth, rt;
  window.addEventListener("resize", () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(rt);
    rt = setTimeout(() => rendered.forEach((id) => draw(id, false)), 150);
  });

  // filtro del scatter
  document.querySelectorAll("#scatterSeg button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#scatterSeg button").forEach((o) => o.setAttribute("aria-pressed", o === b));
    const el = document.getElementById("c-scatter");
    el._filter = b.dataset.v;
    if (rendered.has("c-scatter")) {
      const f = b.dataset.v;
      d3.select(el).selectAll("circle.dot-a, circle.dot-b").interrupt().transition().duration(dur(400))
        .attr("opacity", (d) => (f === "all" || String(d.c) === f ? 0.45 : 0.04));
      setTimeout(() => draw("c-scatter", false), dur(420));
    }
  }));

  /* ------------------------- textos con datos ------------------------- */
  const tasa = (list, v, n) => list.find((d) => d.variable === v && d.nivel === n).tasa;
  const med = (c, k) => d3.median(clientes.filter((d) => d.c === c), (d) => d[k]);
  const totalMot = d3.sum(D.motivos, (d) => d.n);
  const comp = d3.sum(D.motivos.filter((d) => d.motivo.startsWith("Competitor")), (d) => d.n) / totalMot;
  const umbral = D.modelo.umbral;
  const facts = {
    clientes: fInt(D.kpis.clientes),
    bajas: fInt(D.kpis.bajas),
    tasa: fPct(D.kpis.tasa_churn),
    antig: `${fDec(D.kpis.antiguedad_prom, 1)} months`,
    cltv: fUsd0(D.kpis.cltv_prom),
    med_t_b: `${fDec(med(1, "t"), 0)} months`,
    med_t_a: `${fDec(med(0, "t"), 0)} months`,
    med_m_b: fUsd(med(1, "m")),
    med_m_a: fUsd(med(0, "m")),
    mm: fPct(tasa(D.contrato_facturacion, "contract", "Month-to-month")),
    dos: fPct(tasa(D.contrato_facturacion, "contract", "Two year")),
    cheque: fPct(tasa(D.contrato_facturacion, "payment_method", "Electronic check")),
    fibra: fPct(tasa(D.contrato_facturacion, "internet_service", "Fiber optic")),
    sop_no: fPct(tasa(D.servicios, "tech_support", "No")),
    sop_si: fPct(tasa(D.servicios, "tech_support", "Yes")),
    sin_int: fPct(tasa(D.servicios, "tech_support", "No internet")),
    senior: fPct(tasa(D.demografia, "senior_citizen", "Yes")),
    sin_dep: fPct(tasa(D.demografia, "dependents", "No")),
    sin_pareja: fPct(tasa(D.demografia, "partner", "No")),
    comp: fPct0(comp),
    n_test: fInt(D.modelo.n_test),
    umbral: fDec(umbral, 3),
    auc: fDec(D.modelo.auc, 3),
    sens: fPct(D.modelo.sensibilidad),
    spec: fPct(D.modelo.especificidad),
    prec: fPct(D.modelo.precision),
    n_alto: `${fInt(D.riesgo.filter((d) => d.prob > umbral).length)} customers`,
  };
  document.querySelectorAll("[data-f]").forEach((n) => { n.textContent = facts[n.dataset.f]; });

  /* ------------------------- matriz de confusión ------------------------- */
  (function () {
    const cm = D.modelo.matriz;
    const el = document.getElementById("c-cm");
    const grid = document.createElement("div");
    grid.className = "cm";
    const cells = [
      ["h", ""], ["h", "Actual: churned"], ["h", "Actual: stayed"],
      ["h row-h", "Predicted: churn"], ["cell ok", cm.vp, "Churners caught"], ["cell", cm.fp, "False alarms"],
      ["h row-h", "Predicted: stay"], ["cell", cm.fn, "Churners missed"], ["cell ok", cm.vn, "Active correctly classified"],
    ];
    cells.forEach(([cls, v, note]) => {
      const d = document.createElement("div");
      d.className = cls;
      if (cls.startsWith("cell")) {
        const b = document.createElement("b"); b.textContent = fInt(v);
        const s = document.createElement("small"); s.textContent = note;
        d.append(b, s);
      } else d.textContent = v;
      grid.appendChild(d);
    });
    el.appendChild(grid);
  })();

  /* ------------------------- tabla de riesgo ------------------------- */
  (function () {
    const per = 12;
    let page = 0, q = "", risk = "all";
    const tbody = document.getElementById("tbody");
    const info = document.getElementById("pinfo");
    const prev = document.getElementById("prev"), next = document.getElementById("next");
    function rowsF() {
      return D.riesgo.filter((d) =>
        (!q || d.id.toLowerCase().includes(q)) &&
        (risk === "all" || (risk === "hi" ? d.prob > umbral : d.prob <= umbral)));
    }
    function td(text, cls) { const c = document.createElement("td"); if (cls) c.className = cls; c.textContent = text; return c; }
    function render() {
      const rows = rowsF();
      const pages = Math.max(1, Math.ceil(rows.length / per));
      page = Math.min(page, pages - 1);
      tbody.replaceChildren();
      rows.slice(page * per, page * per + per).forEach((d) => {
        const tr = document.createElement("tr");
        tr.append(td(d.id), td(d.contrato), td(d.internet), td(d.pago), td(`${d.antiguedad} mo`, "num"), td(fUsd(d.cargo), "num"));
        const p = document.createElement("td"); p.className = "num";
        const wrap = document.createElement("span"); wrap.className = "prob";
        const t = document.createElement("span"); t.textContent = fPct(d.prob);
        const bar = document.createElement("i"); bar.style.setProperty("--w", (d.prob * 100).toFixed(1) + "%");
        wrap.append(t, bar); p.appendChild(wrap);
        const r = document.createElement("td");
        const tag = document.createElement("span");
        const hi = d.prob > umbral;
        tag.className = "tag " + (hi ? "hi" : "lo");
        tag.textContent = hi ? "▲ High risk" : "▼ Low risk";
        r.appendChild(tag);
        tr.append(p, r);
        tbody.appendChild(tr);
      });
      info.textContent = rows.length ? `${fInt(page * per + 1)}–${fInt(Math.min(rows.length, (page + 1) * per))} of ${fInt(rows.length)} customers` : "No results";
      prev.disabled = page === 0;
      next.disabled = page >= pages - 1;
    }
    document.getElementById("q").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); page = 0; render(); });
    document.querySelectorAll("#riskSeg button").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("#riskSeg button").forEach((o) => o.setAttribute("aria-pressed", o === b));
      risk = b.dataset.v; page = 0; render();
    }));
    prev.addEventListener("click", () => { page--; render(); });
    next.addEventListener("click", () => { page++; render(); });
    render();
  })();

  /* ------------------------- navegación y tema ------------------------- */
  const links = [...document.querySelectorAll(".links a")];
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting && links.some((a) => a.getAttribute("href") === "#" + en.target.id)) {
        links.forEach((a) => {
          const on = a.getAttribute("href") === "#" + en.target.id;
          a.classList.toggle("active", on);
          if (on) {
            const bar = a.parentElement;
            const left = a.offsetLeft - (bar.clientWidth - a.offsetWidth) / 2;
            bar.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? "auto" : "smooth" });
          }
        });
      }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll("main section[id]").forEach((s) => spy.observe(s));

  const root = document.documentElement;
  try { const t = localStorage.getItem("churn-theme"); if (t) root.dataset.theme = t; } catch (e) { /* sin storage */ }
  document.getElementById("themeBtn").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("churn-theme", root.dataset.theme); } catch (e) { /* sin storage */ }
  });
})();
