/**
 * ECharts 价格走势图模块
 * - 动态加载 ECharts CDN（仅一次），带 SRI 校验
 * - 动态加载 ECharts GL CDN（3D 模式按需加载）
 * - 2D 趋势图 / 年份对比图 / 3D 柱状图，三种模式
 * - 3D 模式替代 2D 显示（同一区域叠加切换）
 * - Cookie 持久化模式选择
 * - 日期范围按钮同时影响 2D 和 3D
 */

const ECHARTS_CDN = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js';
const ECHARTS_SRI = 'sha384-Mx5lkUEQPM1pOJCwFtUICyX45KNojXbkWdYhkKUKsbv391mavbfoAmONbzkgYPzR';
const ECHARTS_GL_PRIMARY = 'https://unpkg.com/echarts-gl@2.0.9/dist/echarts-gl.min.js';
const ECHARTS_GL_FALLBACK = 'https://cdn.jsdelivr.net/npm/echarts-gl@2.0.9/dist/echarts-gl.min.js';
const COOKIE_KEY = 'prnd-chart-mode';

interface ChartData {
  dates: string[];
  metal: number[];
  oxide: number[];
  waste: number[];
}

interface CompareData {
  labels: string[];
  years: string[];
  metal: number[][];
  oxide: number[][];
  waste: number[][];
}

// ── 单例加载 ──

let echartsLib: any = null;
let loadPromise: Promise<any> | null = null;
let echartsGlLoaded = false;

function loadECharts(): Promise<any> {
  if (echartsLib) return Promise.resolve(echartsLib);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if ((window as any).echarts) {
      echartsLib = (window as any).echarts;
      return resolve(echartsLib);
    }
    const script = document.createElement('script');
    script.src = ECHARTS_CDN;
    script.integrity = ECHARTS_SRI;
    script.crossOrigin = 'anonymous';
    script.onload = () => { echartsLib = (window as any).echarts; resolve(echartsLib); };
    script.onerror = () => reject(new Error('ECharts CDN load failed'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

function loadEChartsGL(timeoutMs = 15000): Promise<void> {
  if (echartsGlLoaded) return Promise.resolve();

  function tryLoad(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      const timer = setTimeout(() => { script.remove(); reject(new Error(`CDN timeout: ${url}`)); }, timeoutMs);
      script.onload = () => { clearTimeout(timer); echartsGlLoaded = true; resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error(`CDN load failed: ${url}`)); };
      document.head.appendChild(script);
    });
  }

  return tryLoad(ECHARTS_GL_PRIMARY).catch(() => tryLoad(ECHARTS_GL_FALLBACK));
}

// ── Cookie ──

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  const d = new Date();
  d.setTime(d.getTime() + days * 86400000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}

// ── 数据工具 ──

function sampleData(data: ChartData, maxPoints = 120): ChartData {
  const { dates, metal, oxide, waste } = data;
  if (dates.length <= maxPoints) return data;

  const step = Math.ceil(dates.length / maxPoints);
  const sDates: string[] = [], sMetal: number[] = [], sOxide: number[] = [], sWaste: number[] = [];
  for (let i = 0; i < dates.length; i += step) {
    sDates.push(dates[i]); sMetal.push(metal[i]); sOxide.push(oxide[i]); sWaste.push(waste[i]);
  }
  const last = dates.length - 1;
  if (sDates[sDates.length - 1] !== dates[last]) {
    sDates.push(dates[last]); sMetal.push(metal[last]); sOxide.push(oxide[last]); sWaste.push(waste[last]);
  }
  return { dates: sDates, metal: sMetal, oxide: sOxide, waste: sWaste };
}

function filterByDays(data: ChartData, days: number): ChartData {
  const len = data.dates.length;
  const parseDateStr = (s: string) => { const [y, m, d] = s.split('.').map(Number); return new Date(y, m - 1, d).getTime(); };
  const latestMs = parseDateStr(data.dates[len - 1]);
  const msPerDay = 86400000;
  let startIdx = 0;
  for (let i = len - 1; i >= 0; i--) {
    if ((latestMs - parseDateStr(data.dates[i])) / msPerDay > days) { startIdx = i + 1; break; }
  }
  return {
    dates: data.dates.slice(startIdx), metal: data.metal.slice(startIdx),
    oxide: data.oxide.slice(startIdx), waste: data.waste.slice(startIdx),
  };
}

// ── 构建 2D 图表配置 ──

function buildCompareOption(data: CompareData) {
  const { labels, years, metal } = data;
  const colors = ['#f97316', '#38bdf8', '#a78bfa', '#22c55e', '#ef4444', '#eab308'];
  const series = years.map((year, i) => ({
    name: `${year}年`, type: 'line' as const, data: metal[i], smooth: true,
    symbol: 'circle', symbolSize: 2, showSymbol: false,
    lineStyle: { width: 2.5, color: colors[i % colors.length] },
    itemStyle: { color: colors[i % colors.length] },
  }));

  return {
    backgroundColor: 'transparent',
    title: { text: '金属镨钕 年份对比', bottom: -5, left: 'center', textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 'normal' } },
    tooltip: {
      trigger: 'axis', confine: true,
      backgroundColor: 'rgba(15,23,42,0.95)', borderColor: '#334155', textStyle: { color: '#e2e8f0', fontSize: 13 },
      formatter(params: any[]) {
        let s = `<b>${params[0].axisValue}</b><br/>`;
        for (const p of params) {
          if (p.value !== null && p.value !== undefined && p.value !== '-')
            s += `${p.marker} ${p.seriesName}：<b>${Number(p.value).toLocaleString()}</b> 元/吨<br/>`;
        }
        return s;
      },
    },
    legend: {
      data: series.map(s => s.name), top: 58, left: 'center', type: 'scroll',
      textStyle: { color: '#94a3b8', fontSize: 12 },
      selected: years.reduce((acc, y, i) => { acc[`${y}年`] = i >= years.length - 2; return acc; }, {} as Record<string, boolean>),
    },
    grid: { left: 75, right: 75, top: 80, bottom: 45 },
    xAxis: {
      type: 'category', data: labels, boundaryGap: false,
      axisLabel: { rotate: 0, fontSize: 10, color: '#64748b', interval: Math.max(1, Math.floor(labels.length / 12)) },
      axisLine: { lineStyle: { color: '#1e293b' } }, axisTick: { show: false },
    },
    yAxis: {
      type: 'value', name: '元/吨', nameTextStyle: { color: '#64748b', fontSize: 11 },
      axisLabel: { color: '#64748b', fontSize: 11, formatter: (v: number) => (v / 10000).toFixed(0) + '万' },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }, scale: true,
    },
    series,
    media: [
      { query: { maxWidth: 500 }, option: { grid: { left: 55, right: 55, top: 100, bottom: 45 }, xAxis: { axisLabel: { fontSize: 9 } } } },
      { option: { grid: { left: 75, right: 75, top: 80, bottom: 45 } } },
    ],
  };
}

function buildOption(data: ChartData) {
  const { dates, metal, oxide, waste } = data;
  const mkPt = {
    data: [
      { type: 'max', name: '最高', label: { formatter: (p: any) => (p.value / 10000).toFixed(1) + 'w', color: '#fff', fontSize: 10 } },
      { type: 'min', name: '最低', label: { formatter: (p: any) => (p.value / 10000).toFixed(1) + 'w', color: '#fff', fontSize: 10 } },
    ],
  };
  const mkLn = { silent: true, data: [{ type: 'average', name: '平均值' }], label: { formatter: '均值' }, lineStyle: { type: 'dashed', color: '#94a3b8' } };

  return {
    backgroundColor: 'transparent',
    title: { text: '', bottom: -5, left: 'center', textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 'normal' } },
    tooltip: {
      trigger: 'axis', confine: true, axisPointer: { type: 'line', label: { backgroundColor: '#1e293b' } },
      backgroundColor: 'rgba(15,23,42,0.95)', borderColor: '#334155', textStyle: { color: '#e2e8f0', fontSize: 13 },
      formatter(params: any[]) {
        let s = `<b>${params[0].axisValue}</b><br/>`;
        for (const p of params) { if (p.value !== '-') s += `${p.marker} ${p.seriesName}：<b>${Number(p.value).toLocaleString()}</b> 元/吨<br/>`; }
        return s;
      },
    },
    legend: { data: ['金属镨钕', '氧化镨钕', '废料镨钕'], top: 58, left: 'center', textStyle: { color: '#94a3b8', fontSize: 12 }, selected: { '氧化镨钕': false, '废料镨钕': false } },
    dataZoom: [{
      type: 'slider', show: true, bottom: 25, height: 20, borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 11 },
      labelFormatter(v: number) { return dates[v] || ''; },
      handleSize: '120%', handleStyle: { color: '#94a3b8', shadowBlur: 3, shadowColor: 'rgba(0,0,0,0.5)', shadowOffsetX: 1, shadowOffsetY: 1 },
      fillerColor: 'rgba(148,163,184,0.2)', dataBackground: { lineStyle: { color: '#475569' }, areaStyle: { color: '#1e293b' } },
    }],
    xAxis: {
      type: 'category', data: dates, boundaryGap: false,
      axisLabel: { rotate: 30, fontSize: 10, color: '#64748b', hideOverlap: true },
      axisLine: { lineStyle: { color: '#1e293b' } }, axisTick: { show: false },
    },
    yAxis: {
      type: 'value', name: '元/吨', nameTextStyle: { color: '#64748b', fontSize: 11 },
      axisLabel: { color: '#64748b', fontSize: 11, formatter: (v: number) => (v / 10000).toFixed(0) + '万' },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }, scale: true,
    },
    series: [
      { name: '金属镨钕', type: 'line', data: metal, smooth: true, symbol: 'circle', symbolSize: 4, showSymbol: false, lineStyle: { width: 2.5, color: '#f97316' }, itemStyle: { color: '#f97316' }, markPoint: mkPt, markLine: mkLn, areaStyle: { color: new (window as any).echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(249,115,22,0.2)' }, { offset: 1, color: 'rgba(249,115,22,0)' }]) } },
      { name: '氧化镨钕', type: 'line', data: oxide, smooth: true, symbol: 'circle', symbolSize: 4, showSymbol: false, lineStyle: { width: 2.5, color: '#38bdf8' }, itemStyle: { color: '#38bdf8' }, markPoint: mkPt, markLine: mkLn, areaStyle: { color: new (window as any).echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(56,189,248,0.15)' }, { offset: 1, color: 'rgba(56,189,248,0)' }]) } },
      { name: '废料镨钕', type: 'line', data: waste, smooth: true, symbol: 'circle', symbolSize: 4, showSymbol: false, lineStyle: { width: 2.5, color: '#a78bfa' }, itemStyle: { color: '#a78bfa' }, markPoint: mkPt, markLine: mkLn, areaStyle: { color: new (window as any).echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(167,139,250,0.15)' }, { offset: 1, color: 'rgba(167,139,250,0)' }]) } },
    ],
    grid: { left: 75, right: 75, top: 80, bottom: 65 },
    media: [{ query: { maxWidth: 500 }, option: { grid: { left: 55, right: 55, top: 100, bottom: 70 } } }],
  };
}

// ── 构建 3D 柱状图配置 ──

function buildBar3DOption(rawData: ChartData) {
  const data = sampleData(rawData);
  const { dates, metal, oxide, waste } = data;

  const metalData: [number, number, number][] = [];
  const oxideData: [number, number, number][] = [];
  const wasteData: [number, number, number][] = [];
  dates.forEach((_, i) => {
    metalData.push([i, 0, metal[i]]);
    oxideData.push([i, 1, oxide[i]]);
    wasteData.push([i, 2, waste[i]]);
  });

  return {
    tooltip: {
      confine: true, backgroundColor: 'rgba(15,23,42,0.95)', borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 13 },
      formatter(params: any) {
        const x = dates[params.value[0]];
        const names = ['金属镨钕', '氧化镨钕', '废料镨钕'];
        const y = names[params.value[1]] || params.seriesName || '';
        return `<b>${x}</b><br/>${y}：<b>${Number(params.value[2]).toLocaleString()}</b> 元/吨`;
      },
    },
    legend: {
      data: ['金属镨钕', '氧化镨钕', '废料镨钕'],
      top: 72, left: 'center',
      textStyle: { color: '#94a3b8', fontSize: 12 },
    },
    grid3D: {
      boxWidth: Math.min(180, dates.length * 3), boxDepth: 50, boxHeight: 80,
      viewControl: { autoRotate: false, distance: 180, alpha: 25, beta: 50, animation: false },
      light: { main: { intensity: 1.2, alpha: 35, beta: 30 }, ambient: { intensity: 0.6 } },
    },
    xAxis3D: {
      type: 'category', data: dates,
      axisLabel: { fontSize: 9, color: '#94a3b8', interval: Math.max(1, Math.floor(dates.length / 15)), formatter: (v: string) => v.slice(5) },
      axisLine: { lineStyle: { color: '#1e293b' } },
      splitLine: { show: false },
    },
    yAxis3D: {
      type: 'category', data: ['金属镨钕', '氧化镨钕', '废料镨钕'],
      axisLabel: { fontSize: 11, color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#1e293b' } },
      splitLine: { show: false },
    },
    zAxis3D: {
      type: 'value',
      axisLabel: { fontSize: 10, color: '#94a3b8', formatter: (v: number) => (v / 10000).toFixed(1) + 'w' },
      axisLine: { lineStyle: { color: '#1e293b' } },
      splitLine: { show: false },
    },
    series: [
      {
        name: '金属镨钕', type: 'bar3D', data: metalData, shading: 'lambert',
        itemStyle: { color: '#f97316' },
        barSize: Math.max(0.5, Math.min(1.8, 100 / dates.length)),
        emphasis: { itemStyle: { color: '#fbbf24' } }, label: { show: false },
      },
      {
        name: '氧化镨钕', type: 'bar3D', data: oxideData, shading: 'lambert',
        itemStyle: { color: '#38bdf8' },
        barSize: Math.max(0.5, Math.min(1.8, 100 / dates.length)),
        emphasis: { itemStyle: { color: '#fbbf24' } }, label: { show: false },
      },
      {
        name: '废料镨钕', type: 'bar3D', data: wasteData, shading: 'lambert',
        itemStyle: { color: '#a78bfa' },
        barSize: Math.max(0.5, Math.min(1.8, 100 / dates.length)),
        emphasis: { itemStyle: { color: '#fbbf24' } }, label: { show: false },
      },
    ],
  };
}

/** 构建 3D 折线图配置 */
function buildLine3DOption(rawData: ChartData) {
  const data = sampleData(rawData);
  const { dates, metal, oxide, waste } = data;
  const ml: [number, number, number][] = [];
  const ol: [number, number, number][] = [];
  const wl: [number, number, number][] = [];
  dates.forEach((_, i) => { ml.push([i, 0, metal[i]]); ol.push([i, 1, oxide[i]]); wl.push([i, 2, waste[i]]); });

  return {
    tooltip: {
      confine: true, backgroundColor: 'rgba(15,23,42,0.95)', borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 13 },
      formatter(params: any) {
        const x = dates[params.value[0]];
        const names = ['金属镨钕', '氧化镨钕', '废料镨钕'];
        const y = names[params.value[1]] || params.seriesName || '';
        return `<b>${x}</b><br/>${y}：<b>${Number(params.value[2]).toLocaleString()}</b> 元/吨`;
      },
    },
    legend: {
      data: ['金属镨钕', '氧化镨钕', '废料镨钕'],
      top: 72, left: 'center',
      textStyle: { color: '#94a3b8', fontSize: 12 },
    },
    grid3D: {
      boxWidth: Math.min(180, dates.length * 3), boxDepth: 60, boxHeight: 100,
      viewControl: { autoRotate: false, distance: 180, alpha: 25, beta: 50, animation: false },
      light: { main: { intensity: 1.2, alpha: 35, beta: 30 }, ambient: { intensity: 0.6 } },
    },
    xAxis3D: {
      type: 'category', data: dates,
      axisLabel: { fontSize: 9, color: '#94a3b8', interval: Math.max(1, Math.floor(dates.length / 15)), formatter: (v: string) => v.slice(5) },
      axisLine: { lineStyle: { color: '#1e293b' } },
      splitLine: { show: false },
    },
    yAxis3D: {
      type: 'category', data: ['金属镨钕', '氧化镨钕', '废料镨钕'],
      axisLabel: { fontSize: 11, color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#1e293b' } },
      splitLine: { show: false },
    },
    zAxis3D: {
      type: 'value',
      axisLabel: { fontSize: 10, color: '#94a3b8', formatter: (v: number) => (v / 10000).toFixed(1) + 'w' },
      axisLine: { lineStyle: { color: '#1e293b' } },
      splitLine: { show: false },
    },
    series: [
      { name: '金属镨钕', type: 'line3D', data: ml, lineStyle: { color: '#f97316', width: 1.5 }, itemStyle: { color: '#f97316' } },
      { name: '氧化镨钕', type: 'line3D', data: ol, lineStyle: { color: '#38bdf8', width: 1.5 }, itemStyle: { color: '#38bdf8' } },
      { name: '废料镨钕', type: 'line3D', data: wl, lineStyle: { color: '#a78bfa', width: 1.5 }, itemStyle: { color: '#a78bfa' } },
    ],
  };
}

// ── 主入口 ──

export async function initChart(containerId: string, rawData: ChartData, compareData?: CompareData | null) {
  const container2D = document.getElementById(containerId);
  if (!container2D) return;

  // 创建 3D 叠加容器（absolute 定位，与 2D 完全重叠）
  let container3D = document.getElementById(containerId + '-3d');
  if (!container3D) {
    container3D = document.createElement('div');
    container3D.id = containerId + '-3d';
    container3D.style.cssText = 'display:none;position:absolute;top:0;left:0;width:100%;height:100%;background:#0f172a;z-index:50';
    container2D.parentElement?.appendChild(container3D);
  }

  // 注入旋转动画样式
  function injectSpinStyle() {
    if (!document.getElementById('spin3d-style')) {
      const style = document.createElement('style');
      style.id = 'spin3d-style';
      style.textContent = '@keyframes spin3d{to{transform:rotate(360deg)}}';
      document.head.appendChild(style);
    }
  }

  const LOADING_HTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;"><div style="width:32px;height:32px;border:3px solid #334155;border-top-color:#f97316;border-radius:50%;animation:spin3d 0.8s linear infinite;"></div><span style="color:#94a3b8;font-size:14px;">加载 3D 引擎中...</span></div>';

  try {
    const echarts = await loadECharts();
    const chart = echarts.init(container2D, 'dark');
    chart.setOption(buildOption(rawData));

    let currentMode: 'trend' | 'compare' | '3d' = 'trend';
    let isTabClicking = false;
    let chart3D: any = null;
    let activeDays: number | null = 30; // null=全部, 7/30/90
    let current3DType: 'bar' | 'line' = 'bar';

    function build3DOption(data: ChartData) {
      if (current3DType === 'line') return buildLine3DOption(data);
      return buildBar3DOption(data);
    }

    // ── 辅助：更新 tab 按钮高亮 ──
    function highlightTab(selector: string) {
      document.querySelectorAll('.tab.active-mode, .tab.active').forEach(b => b.classList.remove('active-mode', 'active'));
      const btn = document.querySelector(selector);
      if (btn) btn.classList.add('active');
    }

    function highlight3DMode() {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active-mode', 'active'));
      // 3D 模式按钮用 active-mode 类
      document.querySelectorAll('.tab[data-range="3d"]').forEach(b => b.classList.add('active-mode'));
      // 同时高亮当前日期范围按钮
      const rangeBtn = document.querySelector(`.tab[data-range="${activeDays ?? 'all'}"]`);
      if (rangeBtn) rangeBtn.classList.add('active');
    }

    // ── 模式切换 ──

    function switchToCompare() {
      if (!compareData) return;
      currentMode = 'compare';
      container3D.style.display = 'none';
      container2D.style.display = '';
      chart.resize();
      chart.clear();
      chart.setOption(buildCompareOption(compareData), true);
      setCookie(COOKIE_KEY, '2d');
    }

    function updateModeBtnText() {
      const btn = document.querySelector('.tab[data-range="3d"]');
      if (btn) (btn as HTMLElement).textContent = currentMode === '3d' ? '切换2D' : '切换3D';
    }

    function show3DTypeTabs() {
      const sel = document.getElementById('prnd-3dtype') as HTMLSelectElement | null;
      if (sel) { sel.style.display = ''; sel.value = current3DType; }
    }
    function hide3DTypeTabs() {
      const sel = document.getElementById('prnd-3dtype') as HTMLSelectElement | null;
      if (sel) sel.style.display = 'none';
    }

    function switch3DType(type: 'bar' | 'line') {
      if (current3DType === type) return;
      current3DType = type;
      if (currentMode === '3d' && chart3D) {
        // ECharts GL 不支持同一实例切换 series 类型, 必须 dispose + re-init
        const filtered = activeDays ? filterByDays(rawData, activeDays) : rawData;
        chart3D.dispose();
        chart3D = echarts.init(container3D, 'dark');
        chart3D.setOption(build3DOption(filtered));
        setup3DInteractions(chart3D);
      }
      show3DTypeTabs();
    }

    /** 3D 交互：网格仅在拖拽旋转时出现、图例联动轴标签 */
    let _bindGridTimer: ReturnType<typeof setTimeout> | null = null;

    function setup3DInteractions(c3d: any) {
      // 取消之前未完成的 bindGrid 定时器
      if (_bindGridTimer) { clearTimeout(_bindGridTimer); _bindGridTimer = null; }

      const allLabels = ['金属镨钕', '氧化镨钕', '废料镨钕'];
      const dom = c3d.getDom() as HTMLElement;
      const getCanvas = (): HTMLCanvasElement | null => dom.querySelector('canvas');

      let gridTimer: ReturnType<typeof setTimeout> | null = null;

      const showGrid = () => {
        if (gridTimer) { clearTimeout(gridTimer); gridTimer = null; }
        c3d.setOption({
          xAxis3D: { splitLine: { show: true, lineStyle: { color: '#334155' } } },
          zAxis3D: { splitLine: { show: true, lineStyle: { color: '#334155' } } },
        });
      };
      const scheduleHideGrid = () => {
        gridTimer = setTimeout(() => {
          c3d.setOption({
            xAxis3D: { splitLine: { show: false } },
            zAxis3D: { splitLine: { show: false } },
          });
        }, 500);
      };

      const bindGrid = () => {
        const cv = getCanvas();
        if (!cv) { _bindGridTimer = setTimeout(bindGrid, 50); return; }
        cv.addEventListener('mousedown', showGrid);
        cv.addEventListener('mouseup', scheduleHideGrid);
        cv.addEventListener('mouseleave', scheduleHideGrid);
        cv.addEventListener('touchstart', showGrid);
        cv.addEventListener('touchend', scheduleHideGrid);
      };
      _bindGridTimer = setTimeout(bindGrid, 100);

      // 图例点击 → Y 轴标签同步（echarts-gl 不支持局部 setOption 改 3D 轴）
      c3d.on('legendselectchanged', function (params: any) {
        const sel = params.selected;
        const filtered = activeDays ? filterByDays(rawData, activeDays) : rawData;
        const opt = build3DOption(filtered);
        opt.yAxis3D = { ...opt.yAxis3D, data: allLabels.map((n: string) => sel[n] ? n : '') };
        c3d.setOption(opt, false);
      });
    }

    /** 设置初始图例状态：默认只显示金属，同步 Y 轴 */
    function initLegendState(c3d: any) {
      c3d.dispatchAction({ type: 'legendToggleSelect', name: '氧化镨钕' });
      c3d.dispatchAction({ type: 'legendToggleSelect', name: '废料镨钕' });
    }

    function switchToTrend() {
      currentMode = 'trend';
      container3D.style.display = 'none';
      container2D.style.display = '';
      hide3DTypeTabs();
      chart.resize();
      chart.clear();
      chart.setOption(buildOption(rawData), true);
      updateModeBtnText();

      // 恢复当前日期范围到 dataZoom
      if (activeDays) {
        const len = rawData.dates.length;
        const parseDateStr = (s: string) => { const [y, m, d] = s.split('.').map(Number); return new Date(y, m - 1, d).getTime(); };
        const latestMs = parseDateStr(rawData.dates[len - 1]);
        let startIdx = 0;
        for (let i = len - 1; i >= 0; i--) {
          if ((latestMs - parseDateStr(rawData.dates[i])) / 86400000 > activeDays) { startIdx = i + 1; break; }
        }
        const startPct = Math.max(0, (startIdx / Math.max(1, len - 1)) * 100);
        chart.dispatchAction({ type: 'dataZoom', start: startPct, end: 100 });
      }

      setCookie(COOKIE_KEY, '2d');
      setTimeout(() => updateTitleDateRange(), 150);
    }

    async function switchTo3D() {
      currentMode = '3d';
      container2D.style.display = 'none';
      container3D.style.display = 'block';

      if (!chart3D) {
        // 首次加载 3D
        container3D.innerHTML = LOADING_HTML;
        injectSpinStyle();

        try {
          await loadEChartsGL();
          void container3D.offsetHeight; // 强制重排

          // 探针验证 bar3D 已注册
          let bar3dOk = false;
          const probe = document.createElement('div');
          probe.style.cssText = 'position:absolute;width:10px;height:10px;left:-9999px;top:-9999px';
          document.body.appendChild(probe);
          try {
            const probeChart = echarts.init(probe);
            probeChart.setOption({ grid3D: {}, xAxis3D: { type: 'category', data: ['a'] }, yAxis3D: { type: 'category', data: ['b'] }, zAxis3D: { type: 'value' }, series: [{ type: 'bar3D', data: [[0, 0, 1]] }] });
            bar3dOk = !!probe.querySelector('canvas');
            probeChart.dispose();
          } catch { /* ignore */ }
          probe.remove();

          if (!bar3dOk) throw new Error('bar3D 组件未成功注册');

          const filtered = activeDays ? filterByDays(rawData, activeDays) : rawData;
          chart3D = echarts.init(container3D, 'dark');
          chart3D.setOption(build3DOption(filtered));
          setup3DInteractions(chart3D);

          // 监听 3D 容器 resize
          if (!(window as any).__prnd3dResizeBound) {
            (window as any).__prnd3dResizeBound = true;
            window.addEventListener('resize', () => { if (chart3D && currentMode === '3d') chart3D.resize(); });
          }
        } catch (err) {
          console.error('3D init failed:', err);
          const errMsg = err instanceof Error ? err.message : '未知错误';
          container3D.innerHTML = `<p style="text-align:center;color:#94a3b8;padding:60px;">3D 加载失败<br/><span style="font-size:12px;color:#64748b;">${errMsg}</span></p>`;
          setTimeout(() => switchToTrend(), 3500);
          return;
        }
      } else {
        // 已加载过，直接显示并更新数据（保留图例选择的Y轴状态）
        const filtered = activeDays ? filterByDays(rawData, activeDays) : rawData;
        const opt = build3DOption(filtered);
        const savedY = getCurrentYData();
        if (savedY) opt.yAxis3D.data = savedY;
        chart3D.setOption(opt, false);
        chart3D.resize();
      }

      show3DTypeTabs();
      setCookie(COOKIE_KEY, '3d');
      highlight3DMode();
      updateModeBtnText();
    }

    // 从当前 3D 实例读取 Y 轴标签状态，避免 setOption 覆盖
    function getCurrentYData(): string[] | null {
      if (!chart3D) return null;
      const opt = chart3D.getOption();
      return (opt as any)?.yAxis3D?.[0]?.data || null;
    }

    // 3D 模式下更新日期范围
    function update3DRange(days: number | null) {
      activeDays = days;
      if (currentMode === '3d' && chart3D) {
        const filtered = days ? filterByDays(rawData, days) : rawData;
        const opt = build3DOption(filtered);
        const savedY = getCurrentYData();
        if (savedY) opt.yAxis3D.data = savedY;
        chart3D.setOption(opt, false);
      }
      // 同时更新 2D 的 dataZoom（以便切回时保持一致）
      if (currentMode !== '3d') {
        const len = rawData.dates.length;
        const parseDateStr = (s: string) => { const [y, m, d] = s.split('.').map(Number); return new Date(y, m - 1, d).getTime(); };
        const latestMs = parseDateStr(rawData.dates[len - 1]);
        if (days) {
          let startIdx = 0;
          for (let i = len - 1; i >= 0; i--) {
            if ((latestMs - parseDateStr(rawData.dates[i])) / 86400000 > days) { startIdx = i + 1; break; }
          }
          const startPct = Math.max(0, (startIdx / Math.max(1, len - 1)) * 100);
          chart.dispatchAction({ type: 'dataZoom', start: startPct, end: 100 });
        } else {
          chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
        }
      }
    }

    // ── 2D dataZoom 标题更新 ──

    const updateTitleDateRange = () => {
      if (currentMode !== 'trend') return;
      const opt = chart.getOption();
      if (!opt.dataZoom || !opt.dataZoom.length) return;
      const dz = opt.dataZoom[0];
      const len = rawData.dates.length;
      let sI = 0, eI = len - 1;
      if (dz.startValue !== undefined && dz.endValue !== undefined) { sI = Math.max(0, dz.startValue); eI = Math.min(len - 1, dz.endValue); }
      else { sI = Math.floor((dz.start || 0) / 100 * (len - 1)); eI = Math.ceil((dz.end || 100) / 100 * (len - 1)); }
      chart.setOption({ title: { text: `数据区间: ${rawData.dates[sI]} 至 ${rawData.dates[eI]}` } });
    };

    chart.on('dataZoom', () => {
      updateTitleDateRange();
      if (!isTabClicking) document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    });
    updateTitleDateRange();

    // ── Tab 按钮事件 ──

    document.querySelectorAll('.tab[data-range]').forEach(btn => {
      (btn as HTMLElement).addEventListener('click', async function () {
        isTabClicking = true;
        const range = this.dataset.range!;

        // ── 3D 按钮（toggle） ──
        if (range === '3d') {
          if (currentMode !== '3d') {
            highlight3DMode();
            await switchTo3D();
          } else {
            switchToTrend();
            highlightTab(`.tab[data-range="${activeDays ?? 'all'}"]`);
          }
          isTabClicking = false;
          return;
        }

        // ── 对比按钮（仅 2D） ──
        if (range === 'compare') {
          if (currentMode === '3d') switchToTrend();
          highlightTab('.tab[data-range="compare"]');
          switchToCompare();
          isTabClicking = false;
          return;
        }

        // ── 日期范围按钮（all/7/30/90） ──
        const days = range === 'all' ? null : parseInt(range);
        update3DRange(days);

        if (currentMode === '3d') {
          highlight3DMode();
        } else {
          if (currentMode === 'compare') switchToTrend();
          highlightTab(`.tab[data-range="${range}"]`);
        }

        setTimeout(() => { updateTitleDateRange(); isTabClicking = false; }, 100);
      });
    });

    // ── 3D 类型下拉框 ──
    const sel3d = document.getElementById('prnd-3dtype') as HTMLSelectElement | null;
    if (sel3d) {
      sel3d.addEventListener('change', function () {
        switch3DType(this.value as 'bar' | 'line');
      });
    }

    // ── 窗口 resize ──
    window.addEventListener('resize', () => {
      if (currentMode === '3d' && chart3D) chart3D.resize();
      else chart.resize();
    });

    // ── 初始化：检查 Cookie 恢复模式 ──
    const savedMode = getCookie(COOKIE_KEY);

    if (savedMode === '3d') {
      // 恢复 3D 模式
      setTimeout(async () => {
        highlight3DMode();
        await switchTo3D();
      }, 100);
    } else {
      // 默认 30 天
      setTimeout(() => {
        const btn30 = document.querySelector('.tab[data-range="30"]');
        if (btn30) (btn30 as HTMLElement).click();
      }, 80);
    }
  } catch (err) {
    console.error(err);
    const c = document.getElementById(containerId);
    if (c) c.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:60px;">图表加载失败，请刷新页面重试</p>';
  }
}
