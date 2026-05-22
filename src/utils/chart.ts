/**
 * ECharts 价格走势图模块
 * - 动态加载 ECharts CDN（仅一次），带 SRI 校验
 * - 动态加载 ECharts GL CDN（3D 模式按需加载）
 * - 支持趋势图、年份对比图、3D 柱状图三种模式
 * - 入场交错动画 + 脉冲标记 + 增强 hover 效果
 */

const ECHARTS_CDN = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js';
const ECHARTS_SRI = 'sha384-Mx5lkUEQPM1pOJCwFtUICyX45KNojXbkWdYhkKUKsbv391mavbfoAmONbzkgYPzR';
const ECHARTS_GL_CDN = 'https://cdn.jsdelivr.net/npm/echarts-gl@2.0.9/dist/echarts-gl.min.js';

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
    script.onload = () => {
      echartsLib = (window as any).echarts;
      resolve(echartsLib);
    };
    script.onerror = () => reject(new Error('ECharts CDN load failed'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

function loadEChartsGL(): Promise<void> {
  if (echartsGlLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if ((window as any).echarts?.gl) {
      echartsGlLoaded = true;
      return resolve();
    }
    const script = document.createElement('script');
    script.src = ECHARTS_GL_CDN;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      echartsGlLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('ECharts GL CDN load failed'));
    document.head.appendChild(script);
  });
}

// ── 数据采样（3D 图表降采样用） ──

function sampleData(data: ChartData, maxPoints = 120): ChartData {
  const { dates, metal, oxide, waste } = data;
  if (dates.length <= maxPoints) return data;

  const step = Math.ceil(dates.length / maxPoints);
  const sampledDates: string[] = [];
  const sampledMetal: number[] = [];
  const sampledOxide: number[] = [];
  const sampledWaste: number[] = [];

  for (let i = 0; i < dates.length; i += step) {
    sampledDates.push(dates[i]);
    sampledMetal.push(metal[i]);
    sampledOxide.push(oxide[i]);
    sampledWaste.push(waste[i]);
  }
  // 确保最后一个点包含在内
  const last = dates.length - 1;
  if (sampledDates[sampledDates.length - 1] !== dates[last]) {
    sampledDates.push(dates[last]);
    sampledMetal.push(metal[last]);
    sampledOxide.push(oxide[last]);
    sampledWaste.push(waste[last]);
  }
  return { dates: sampledDates, metal: sampledMetal, oxide: sampledOxide, waste: sampledWaste };
}

// ── 通用增强配置 ──

/** 系列通用动画配置 */
const ANIM_IN = {
  animationDuration: 1400,
  animationEasing: 'cubicOut' as const,
};

const ANIM_UPDATE = {
  animationDurationUpdate: 800,
  animationEasingUpdate: 'cubicInOut' as const,
};

/** emphasis 发光效果 */
const EMPHASIS_GLOW = {
  emphasis: {
    focus: 'series' as const,
    lineStyle: { width: 4.5, shadowBlur: 12, shadowColor: 'currentColor' as any },
    itemStyle: { shadowBlur: 12, shadowColor: 'currentColor' as any },
  },
};

/** markPoint / markLine 共享配置 */
function makeMarkExtras() {
  return {
    markPoint: {
      animation: true,
      animationDuration: 600,
      animationDelay: 1000,
      data: [
        { type: 'max', name: '最高', label: { formatter: (p: any) => (p.value / 10000).toFixed(1) + 'w', color: '#fff', fontSize: 10 } },
        { type: 'min', name: '最低', label: { formatter: (p: any) => (p.value / 10000).toFixed(1) + 'w', color: '#fff', fontSize: 10 } },
      ],
    },
    markLine: {
      silent: true,
      animation: true,
      animationDuration: 600,
      animationDelay: 1200,
      data: [{ type: 'average', name: '平均值' }],
      label: { formatter: '均值' },
      lineStyle: { type: 'dashed', color: '#94a3b8' },
    },
  };
}

// ── 2D 趋势图 ──

function buildOption(data: ChartData) {
  const { dates, metal, oxide, waste } = data;
  const lastIdx = dates.length - 1;

  const seriesColors = ['#f97316', '#38bdf8', '#a78bfa'];
  const seriesData = [
    { name: '金属镨钕', color: seriesColors[0], data: metal },
    { name: '氧化镨钕', color: seriesColors[1], data: oxide },
    { name: '废料镨钕', color: seriesColors[2], data: waste },
  ];

  const lineSeries = seriesData.map((s, i) => ({
    name: s.name,
    type: 'line' as const,
    data: s.data,
    smooth: true,
    symbol: 'circle',
    symbolSize: 4,
    showSymbol: false,
    animationDelay: i * 280,
    ...ANIM_IN,
    ...ANIM_UPDATE,
    ...EMPHASIS_GLOW,
    lineStyle: { width: 2.5, color: s.color },
    itemStyle: { color: s.color },
    areaStyle: {
      color: new (window as any).echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: s.color.replace(')', ',0.22)').replace('rgb', 'rgba') },
        { offset: 1, color: s.color.replace(')', ',0)').replace('rgb', 'rgba') },
      ]),
    },
    ...makeMarkExtras(),
  }));

  // 脉冲标记 — 最新数据点呼吸光环
  const pulseSeries = seriesData.map((s, i) => ({
    name: `${s.name}-脉冲`,
    type: 'effectScatter' as const,
    data: [[lastIdx, s.data[lastIdx]]],
    showEffectOn: 'render' as const,
    rippleEffect: { brushType: 'stroke' as const, scale: 3.5, period: 3.5 },
    symbolSize: 10,
    animationDelay: 1200 + i * 280,
    animationDuration: 600,
    zlevel: 1,
    itemStyle: { color: s.color, shadowBlur: 8, shadowColor: s.color },
  }));

  return {
    backgroundColor: 'transparent',
    title: {
      text: '',
      bottom: -5,
      left: 'center',
      textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 'normal' },
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'line', label: { backgroundColor: '#1e293b' }, lineStyle: { color: '#475569', type: 'dashed' } },
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 13 },
      formatter(params: any[]) {
        let s = `<b>${params[0].axisValue}</b><br/>`;
        for (const p of params) {
          if (p.seriesType === 'effectScatter') continue;
          if (p.value !== '-' && p.value != null) {
            s += `${p.marker} ${p.seriesName}：<b>${Number(p.value).toLocaleString()}</b> 元/吨<br/>`;
          }
        }
        return s;
      },
    },
    legend: {
      data: seriesData.map(s => s.name),
      top: 58,
      left: 'center',
      textStyle: { color: '#94a3b8', fontSize: 12 },
      selected: { '氧化镨钕': false, '废料镨钕': false },
    },
    dataZoom: [
      {
        type: 'slider',
        show: true,
        bottom: 25,
        height: 20,
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 11 },
        labelFormatter(value: number) { return dates[value] || ''; },
        handleSize: '120%',
        handleStyle: { color: '#94a3b8', shadowBlur: 3, shadowColor: 'rgba(0,0,0,0.5)', shadowOffsetX: 1, shadowOffsetY: 1 },
        fillerColor: 'rgba(148,163,184,0.2)',
        dataBackground: { lineStyle: { color: '#475569' }, areaStyle: { color: '#1e293b' } },
      },
    ],
    xAxis: {
      type: 'category', data: dates, boundaryGap: false,
      axisLabel: { rotate: 30, fontSize: 10, color: '#64748b', hideOverlap: true },
      axisLine: { lineStyle: { color: '#1e293b' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value', name: '元/吨',
      nameTextStyle: { color: '#64748b', fontSize: 11 },
      axisLabel: { color: '#64748b', fontSize: 11, formatter: (v: number) => (v / 10000).toFixed(0) + '万' },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      scale: true,
    },
    series: [...lineSeries, ...pulseSeries],
    grid: { left: 75, right: 75, top: 80, bottom: 65 },
    media: [
      {
        query: { maxWidth: 500 },
        option: { grid: { left: 55, right: 55, top: 100, bottom: 70 } },
      },
    ],
  };
}

// ── 2D 年份对比图 ──

function buildCompareOption(data: CompareData) {
  const { labels, years, metal } = data;
  const colors = ['#f97316', '#38bdf8', '#a78bfa', '#22c55e', '#ef4444', '#eab308'];

  const series = years.map((year, i) => ({
    name: `${year}年`,
    type: 'line' as const,
    data: metal[i],
    smooth: true,
    symbol: 'circle',
    symbolSize: 2,
    showSymbol: false,
    animationDelay: i * 200,
    ...ANIM_IN,
    ...ANIM_UPDATE,
    ...EMPHASIS_GLOW,
    lineStyle: { width: 2.5, color: colors[i % colors.length] },
    itemStyle: { color: colors[i % colors.length] },
  }));

  return {
    backgroundColor: 'transparent',
    title: {
      text: '金属镨钕 年份对比',
      bottom: -5,
      left: 'center',
      textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 'normal' },
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 13 },
      formatter(params: any[]) {
        let s = `<b>${params[0].axisValue}</b><br/>`;
        for (const p of params) {
          if (p.value !== null && p.value !== undefined && p.value !== '-') {
            s += `${p.marker} ${p.seriesName}：<b>${Number(p.value).toLocaleString()}</b> 元/吨<br/>`;
          }
        }
        return s;
      },
    },
    legend: {
      data: series.map(s => s.name),
      top: 58,
      left: 'center',
      type: 'scroll',
      textStyle: { color: '#94a3b8', fontSize: 12 },
      selected: years.reduce((acc, y, i) => {
        acc[`${y}年`] = i >= years.length - 2;
        return acc;
      }, {} as Record<string, boolean>),
    },
    grid: { left: 75, right: 75, top: 80, bottom: 45 },
    xAxis: {
      type: 'category', data: labels, boundaryGap: false,
      axisLabel: { rotate: 0, fontSize: 10, color: '#64748b', interval: Math.max(1, Math.floor(labels.length / 12)) },
      axisLine: { lineStyle: { color: '#1e293b' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value', name: '元/吨',
      nameTextStyle: { color: '#64748b', fontSize: 11 },
      axisLabel: { color: '#64748b', fontSize: 11, formatter: (v: number) => (v / 10000).toFixed(0) + '万' },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      scale: true,
    },
    series,
    media: [
      {
        query: { maxWidth: 500 },
        option: { grid: { left: 55, right: 55, top: 100, bottom: 45 }, xAxis: { axisLabel: { fontSize: 9 } } },
      },
    ],
  };
}

// ── 3D 柱状图 ──

function buildBar3DOption(rawData: ChartData) {
  const data = sampleData(rawData);
  const { dates, metal, oxide, waste } = data;

  // 构建数据：[xIndex, yIndex, zValue]
  const seriesData: [number, number, number][] = [];
  dates.forEach((_, i) => {
    seriesData.push([i, 0, metal[i]]);
    seriesData.push([i, 1, oxide[i]]);
    seriesData.push([i, 2, waste[i]]);
  });

  return {
    backgroundColor: 'transparent',
    tooltip: {
      confine: true,
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 13 },
      formatter(params: any) {
        const x = dates[params.value[0]];
        const names = ['金属镨钕', '氧化镨钕', '废料镨钕'];
        const y = names[params.value[1]] || '';
        const z = Number(params.value[2]).toLocaleString();
        return `<b>${x}</b><br/>${y}：<b>${z}</b> 元/吨`;
      },
    },
    visualMap: {
      dimension: 1,
      pieces: [
        { min: 0, max: 0, color: '#f97316' },
        { min: 1, max: 1, color: '#38bdf8' },
        { min: 2, max: 2, color: '#a78bfa' },
      ],
      show: false,
    },
    grid3D: {
      boxWidth: Math.min(200, dates.length * 3.5),
      boxDepth: 60,
      viewControl: {
        autoRotate: true,
        autoRotateSpeed: 6,
        distance: 180,
        alpha: 28,
        beta: 40,
        animation: true,
        animationDurationUpdate: 1000,
        animationEasingUpdate: 'cubicInOut',
      },
      light: {
        main: { intensity: 1.2, shadow: true, shadowQuality: 'medium', alpha: 35, beta: 30 },
        ambient: { intensity: 0.5 },
        ambientCubemap: {
          texture: '', // 跳过环境贴图，使用纯色环境光
        },
      },
      postEffect: { enable: true, bloom: { enable: false }, SSAO: { enable: true, quality: 'medium', radius: 2, intensity: 0.8 } },
      environment: '#0f172a',
    },
    xAxis3D: {
      type: 'category',
      data: dates,
      name: '',
      axisLabel: {
        fontSize: 9,
        color: '#64748b',
        interval: Math.max(1, Math.floor(dates.length / 15)),
        formatter: (v: string) => v.slice(5), // 只显示 MM.DD
      },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    yAxis3D: {
      type: 'category',
      data: ['金属镨钕', '氧化镨钕', '废料镨钕'],
      name: '',
      axisLabel: { fontSize: 11, color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    zAxis3D: {
      type: 'value',
      name: '',
      axisLabel: {
        fontSize: 10,
        color: '#64748b',
        formatter: (v: number) => (v / 10000).toFixed(1) + 'w',
      },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [
      {
        type: 'bar3D',
        data: seriesData,
        shading: 'realistic',
        animationDuration: 1600,
        animationEasing: 'cubicOut',
        barSize: Math.max(0.6, Math.min(2, 120 / dates.length)),
        emphasis: {
          label: { show: false },
          itemStyle: { color: '#fbbf24' },
        },
        label: { show: false },
      },
    ],
  };
}

// ── 主入口 ──

export async function initChart(
  containerId: string,
  rawData: ChartData,
  compareData?: CompareData | null,
) {
  const container2D = document.getElementById(containerId);
  if (!container2D) return;

  // 获取/创建 3D 容器
  let container3D = document.getElementById(containerId + '-3d');
  if (!container3D) {
    container3D = document.createElement('div');
    container3D.id = containerId + '-3d';
    container3D.className = 'full-chart';
    container3D.style.display = 'none';
    container2D.parentElement?.appendChild(container3D);
  }

  try {
    const echarts = await loadECharts();
    const chart = echarts.init(container2D, 'dark');
    chart.setOption(buildOption(rawData));

    let currentMode: 'trend' | 'compare' | '3d' = 'trend';
    let isTabClicking = false;
    let chart3D: any = null;

    // ── 模式切换 ──

    function switchToTrend() {
      currentMode = 'trend';
      // 隐藏 3D
      if (chart3D) {
        chart3D.dispose();
        chart3D = null;
      }
      container2D.style.display = '';
      container3D.style.display = 'none';
      chart.resize();
      chart.clear();
      chart.setOption(buildOption(rawData), true);
      setTimeout(() => updateTitleDateRange(), 100);
    }

    function switchToCompare() {
      if (!compareData) return;
      currentMode = 'compare';
      if (chart3D) {
        chart3D.dispose();
        chart3D = null;
      }
      container2D.style.display = '';
      container3D.style.display = 'none';
      chart.resize();
      chart.clear();
      chart.setOption(buildCompareOption(compareData), true);
    }

    async function switchTo3D() {
      currentMode = '3d';
      container2D.style.display = 'none';
      container3D.style.display = '';

      try {
        await loadEChartsGL();
        if (chart3D) chart3D.dispose();
        chart3D = echarts.init(container3D, 'dark');
        chart3D.setOption(buildBar3DOption(rawData));
      } catch (err) {
        console.error('ECharts GL load failed, fallback to 2D', err);
        container3D.style.display = 'none';
        container3D.innerHTML =
          '<p style="text-align:center;color:#94a3b8;padding:60px;">3D 模块加载失败，请检查网络后重试</p>';
        container3D.style.display = '';
        // 3 秒后切回 2D
        setTimeout(() => {
          chart.resize();
          currentMode = 'trend';
          container2D.style.display = '';
          container3D.style.display = 'none';
          const activeBtn = document.querySelector('.chart-tabs .tab.active');
          if (activeBtn) {
            activeBtn.classList.remove('active');
            const btn30 = document.querySelector('.chart-tabs .tab[data-range="30"]');
            if (btn30) btn30.classList.add('active');
          }
        }, 3500);
      }
    }

    function destroy3D() {
      if (chart3D) {
        chart3D.dispose();
        chart3D = null;
      }
      container2D.style.display = '';
      container3D.style.display = 'none';
    }

    // ── 动态标题 ──

    const updateTitleDateRange = () => {
      if (currentMode !== 'trend') return;
      const opt = chart.getOption();
      if (!opt.dataZoom || !opt.dataZoom.length) return;
      const dz = opt.dataZoom[0];
      const len = rawData.dates.length;
      let startIdx = 0, endIdx = len - 1;
      if (dz.startValue !== undefined && dz.endValue !== undefined) {
        startIdx = Math.max(0, dz.startValue);
        endIdx = Math.min(len - 1, dz.endValue);
      } else {
        startIdx = Math.floor((dz.start || 0) / 100 * (len - 1));
        endIdx = Math.ceil((dz.end || 100) / 100 * (len - 1));
      }
      chart.setOption({
        title: { text: `数据区间: ${rawData.dates[startIdx]} 至 ${rawData.dates[endIdx]}` },
      });
    };

    // ── 事件 ──

    chart.on('dataZoom', () => {
      updateTitleDateRange();
      if (!isTabClicking) {
        document.querySelectorAll('.chart-tabs .tab').forEach(b => b.classList.remove('active'));
      }
    });
    updateTitleDateRange();

    // ── Tab 按钮 ──

    document.querySelectorAll('.chart-tabs .tab').forEach(btn => {
      (btn as HTMLElement).addEventListener('click', async function () {
        isTabClicking = true;
        const range = this.dataset.range;

        // 点击 3D 按钮
        if (range === '3d') {
          document.querySelectorAll('.chart-tabs .tab').forEach(b => b.classList.remove('active'));
          this.classList.add('active');
          await switchTo3D();
          isTabClicking = false;
          return;
        }

        // 如果当前在 3D 模式，先切回
        if (currentMode === '3d') {
          destroy3D();
          chart.clear();
          chart.setOption(buildOption(rawData), true);
          currentMode = 'trend';
        }

        document.querySelectorAll('.chart-tabs .tab').forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        // 对比模式
        if (range === 'compare') {
          switchToCompare();
          isTabClicking = false;
          return;
        }

        // 如果当前在对比模式，先切回趋势
        if (currentMode === 'compare') {
          switchToTrend();
        }

        // 时间范围
        if (range === 'all') {
          chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
        } else {
          const calDays = parseInt(range!);
          const parseDateStr = (s: string) => {
            const [y, m, d] = s.split('.').map(Number);
            return new Date(y, m - 1, d).getTime();
          };
          const latestMs = parseDateStr(rawData.dates[rawData.dates.length - 1]);
          const msPerDay = 86400000;
          let startIdx = 0;
          for (let i = rawData.dates.length - 1; i >= 0; i--) {
            if ((latestMs - parseDateStr(rawData.dates[i])) / msPerDay > calDays) {
              startIdx = i + 1;
              break;
            }
          }
          const startPct = Math.max(0, (startIdx / Math.max(1, rawData.dates.length - 1)) * 100);
          chart.dispatchAction({ type: 'dataZoom', start: startPct, end: 100 });
        }
        setTimeout(() => {
          updateTitleDateRange();
          isTabClicking = false;
        }, 100);
      });
    });

    window.addEventListener('resize', () => {
      chart.resize();
      if (chart3D) chart3D.resize();
    });

    // 默认展示近 30 天
    setTimeout(() => {
      const btn30 = document.querySelector('.chart-tabs .tab[data-range="30"]');
      if (btn30) (btn30 as HTMLElement).click();
    }, 80);
  } catch (err) {
    console.error(err);
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:60px;">图表加载失败，请刷新页面重试</p>';
    }
  }
}
