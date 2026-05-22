/**
 * ECharts 价格走势图模块
 * - 动态加载 ECharts CDN（仅一次）
 * - 带 SRI 完整性校验
 * - 动态加载 ECharts GL CDN（3D 模式按需加载）
 * - 支持趋势图、年份对比图、3D 柱状图三种模式
 */

const ECHARTS_CDN = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js';
const ECHARTS_SRI = 'sha384-Mx5lkUEQPM1pOJCwFtUICyX45KNojXbkWdYhkKUKsbv391mavbfoAmONbzkgYPzR';
// unpkg 为主（Cloudflare CDN，国内移动端兼容性更好），jsdelivr 为兜底
const ECHARTS_GL_CDN_PRIMARY = 'https://unpkg.com/echarts-gl@2.0.9/dist/echarts-gl.min.js';
const ECHARTS_GL_CDN_FALLBACK = 'https://cdn.jsdelivr.net/npm/echarts-gl@2.0.9/dist/echarts-gl.min.js';

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

let echartsLib: any = null;
let loadPromise: Promise<any> | null = null;
let echartsGlLoaded = false;

/** 加载 ECharts（单例，带 SRI） */
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

/** 加载 ECharts GL（按需加载，带超时和 CDN 容灾） */
function loadEChartsGL(timeoutMs = 15000): Promise<void> {
  if (echartsGlLoaded) return Promise.resolve();

  function tryLoad(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      const timer = setTimeout(() => {
        script.remove();
        reject(new Error(`CDN timeout: ${url}`));
      }, timeoutMs);
      script.onload = () => {
        clearTimeout(timer);
        echartsGlLoaded = true;
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error(`CDN load failed: ${url}`));
      };
      document.head.appendChild(script);
    });
  }

  // 先尝试 unpkg，失败则回退 jsdelivr
  return tryLoad(ECHARTS_GL_CDN_PRIMARY).catch(() =>
    tryLoad(ECHARTS_GL_CDN_FALLBACK)
  );
}

/** 数据采样（3D 图表降采样用，超过 maxPoints 时均匀采样） */
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
  const last = dates.length - 1;
  if (sampledDates[sampledDates.length - 1] !== dates[last]) {
    sampledDates.push(dates[last]);
    sampledMetal.push(metal[last]);
    sampledOxide.push(oxide[last]);
    sampledWaste.push(waste[last]);
  }
  return { dates: sampledDates, metal: sampledMetal, oxide: sampledOxide, waste: sampledWaste };
}

/** 构建年份对比图配置 */
function buildCompareOption(data: CompareData) {
  const { labels, years, metal } = data;
  // 年份配色
  const colors = ['#f97316', '#38bdf8', '#a78bfa', '#22c55e', '#ef4444', '#eab308'];
  
  const series = years.map((year, i) => ({
    name: `${year}年`,
    type: 'line' as const,
    data: metal[i],
    smooth: true,
    symbol: 'circle',
    symbolSize: 2,
    showSymbol: false,
    lineStyle: { width: 2.5, color: colors[i % colors.length] },
    itemStyle: { color: colors[i % colors.length] },
  }));

  return {
    backgroundColor: 'transparent',
    title: {
      text: `金属镨钕 年份对比`,
      bottom: -5,
      left: 'center',
      textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 'normal' }
    },
    tooltip: {
      trigger: 'axis',
      confine: true, // 防移动端溢出
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
      }
    },
    legend: {
      data: series.map(s => s.name),
      top: 58,
      left: 'center',
      type: 'scroll', // 移动端多图例滚动
      textStyle: { color: '#94a3b8', fontSize: 12 },
      selected: years.reduce((acc, y, i) => {
        // 默认只显示最近两年
        acc[`${y}年`] = i >= years.length - 2;
        return acc;
      }, {} as Record<string, boolean>)
    },
    grid: { left: 75, right: 75, top: 80, bottom: 45 },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLabel: { rotate: 0, fontSize: 10, color: '#64748b', interval: Math.max(1, Math.floor(labels.length / 12)) },
      axisLine: { lineStyle: { color: '#1e293b' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: '元/吨',
      nameTextStyle: { color: '#64748b', fontSize: 11 },
      axisLabel: { color: '#64748b', fontSize: 11, formatter: (v: number) => (v / 10000).toFixed(0) + '万' },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      scale: true
    },
    series,
    media: [
      {
        query: { maxWidth: 500 }, // 小屏专属优化
        option: {
          grid: { left: 55, right: 55, top: 100, bottom: 45 },
          xAxis: { axisLabel: { fontSize: 9 } }
        }
      },
      {
        option: {
          grid: { left: 75, right: 75, top: 80, bottom: 45 }
        }
      }
    ]
  };
}

function buildOption(data: ChartData) {
  const { dates, metal, oxide, waste } = data;
  
  const markPointConfig = {
    data: [
      { type: 'max', name: '最高', label: { formatter: (p: any) => (p.value/10000).toFixed(1) + 'w', color: '#fff', fontSize: 10 } },
      { type: 'min', name: '最低', label: { formatter: (p: any) => (p.value/10000).toFixed(1) + 'w', color: '#fff', fontSize: 10 } }
    ]
  };
  const markLineConfig = {
    silent: true, // 禁用均值线的点击/悬停交互（不响应鼠标事件）
    data: [{ type: 'average', name: '平均值' }],
    label: { formatter: '均值' },
    lineStyle: { type: 'dashed', color: '#94a3b8' }
  };

  return {
    backgroundColor: 'transparent',
    title: {
      text: '', // 动态更新
      bottom: -5,
      left: 'center',
      textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 'normal' }
    },
    tooltip: {
      trigger: 'axis',
      confine: true, // 防移动端溢出
      axisPointer: { type: 'line', label: { backgroundColor: '#1e293b' } },
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 13 },
      formatter(params: any[]) {
        let s = `<b>${params[0].axisValue}</b><br/>`;
        for (const p of params) {
          if (p.value !== '-') {
            s += `${p.marker} ${p.seriesName}：<b>${Number(p.value).toLocaleString()}</b> 元/吨<br/>`;
          }
        }
        return s;
      }
    },
    legend: {
      data: ['金属镨钕', '氧化镨钕', '废料镨钕'],
      top: 58, 
      left: 'center',
      textStyle: { color: '#94a3b8', fontSize: 12 },
      selected: { '氧化镨钕': false, '废料镨钕': false }
    },
    dataZoom: [
      { 
        type: 'slider', 
        show: true, 
        bottom: 25, 
        height: 20, 
        borderColor: '#334155', 
        textStyle: { color: '#f8fafc', fontSize: 11 },
        labelFormatter: function (value: number) {
          return dates[value] || '';
        },
        handleSize: '120%',
        handleStyle: { color: '#94a3b8', shadowBlur: 3, shadowColor: 'rgba(0,0,0,0.5)', shadowOffsetX: 1, shadowOffsetY: 1 },
        fillerColor: 'rgba(148,163,184,0.2)',
        dataBackground: { lineStyle: { color: '#475569' }, areaStyle: { color: '#1e293b' } }
      }
    ],
    xAxis: {
      type: 'category', data: dates, boundaryGap: false,
      axisLabel: { rotate: 30, fontSize: 10, color: '#64748b', hideOverlap: true },
      axisLine: { lineStyle: { color: '#1e293b' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value', name: '元/吨',
      nameTextStyle: { color: '#64748b', fontSize: 11 },
      axisLabel: { color: '#64748b', fontSize: 11, formatter: (v: number) => (v / 10000).toFixed(0) + '万' },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      scale: true
    },
    series: [
      {
        name: '金属镨钕', type: 'line', data: metal, smooth: true,
        symbol: 'circle', symbolSize: 4, showSymbol: false,
        lineStyle: { width: 2.5, color: '#f97316' }, itemStyle: { color: '#f97316' },
        markPoint: markPointConfig, markLine: markLineConfig,
        areaStyle: { color: new (window as any).echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(249,115,22,0.2)' }, { offset: 1, color: 'rgba(249,115,22,0)' }])}
      },
      {
        name: '氧化镨钕', type: 'line', data: oxide, smooth: true,
        symbol: 'circle', symbolSize: 4, showSymbol: false,
        lineStyle: { width: 2.5, color: '#38bdf8' }, itemStyle: { color: '#38bdf8' },
        markPoint: markPointConfig, markLine: markLineConfig,
        areaStyle: { color: new (window as any).echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(56,189,248,0.15)' }, { offset: 1, color: 'rgba(56,189,248,0)' }])}
      },
      {
        name: '废料镨钕', type: 'line', data: waste, smooth: true,
        symbol: 'circle', symbolSize: 4, showSymbol: false,
        lineStyle: { width: 2.5, color: '#a78bfa' }, itemStyle: { color: '#a78bfa' },
        markPoint: markPointConfig, markLine: markLineConfig,
        areaStyle: { color: new (window as any).echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(167,139,250,0.15)' }, { offset: 1, color: 'rgba(167,139,250,0)' }])}
      }
    ],
    grid: { left: 75, right: 75, top: 80, bottom: 65 },
    media: [
      {
        query: { maxWidth: 500 }, // 小屏专属优化
        option: {
          grid: { left: 55, right: 55, top: 100, bottom: 70 }
        }
      }
    ]
  };
}

/** 构建 3D 柱状图配置 */
function buildBar3DOption(rawData: ChartData) {
  const data = sampleData(rawData);
  const { dates, metal, oxide, waste } = data;

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
      },
      postEffect: {
        enable: true,
        bloom: { enable: false },
        SSAO: { enable: true, quality: 'medium', radius: 2, intensity: 0.8 },
      },
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
        formatter: (v: string) => v.slice(5),
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

export async function initChart(containerId: string, rawData: ChartData, compareData?: CompareData | null) {
  const container2D = document.getElementById(containerId);
  if (!container2D) return;

  // 创建 3D 容器
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
    
    // 初始化配置
    chart.setOption(buildOption(rawData));

    let currentMode: 'trend' | 'compare' | '3d' = 'trend';
    let isTabClicking = false;
    let chart3D: any = null;

    // 年份对比模式
    function switchToCompare() {
      if (!compareData) return;
      currentMode = 'compare';
      destroy3D();
      chart.clear();
      chart.setOption(buildCompareOption(compareData), true);
    }

    function switchToTrend() {
      currentMode = 'trend';
      destroy3D();
      chart.clear();
      chart.setOption(buildOption(rawData), true);
      updateTitleDateRange();
    }

    async function switchTo3D() {
      currentMode = '3d';
      container2D.style.display = 'none';
      container3D.style.display = '';
      // 显示加载状态
      container3D.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;"><div style="width:32px;height:32px;border:3px solid #334155;border-top-color:#f97316;border-radius:50%;animation:spin3d 0.8s linear infinite;"></div><span style="color:#94a3b8;font-size:14px;">加载 3D 引擎中...</span></div>';
      // 注入旋转动画样式（只注入一次）
      if (!document.getElementById('spin3d-style')) {
        const style = document.createElement('style');
        style.id = 'spin3d-style';
        style.textContent = '@keyframes spin3d{to{transform:rotate(360deg)}}';
        document.head.appendChild(style);
      }

      try {
        await loadEChartsGL();
        if (chart3D) chart3D.dispose();
        chart3D = echarts.init(container3D, 'dark');
        chart3D.setOption(buildBar3DOption(rawData));
      } catch (err) {
        console.error('ECharts GL load failed, fallback to 2D', err);
        container3D.innerHTML =
          '<p style="text-align:center;color:#94a3b8;padding:60px;">3D 模块加载失败，请检查网络后重试</p>';
        // 3 秒后自动切回 2D
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

    // 动态更新底部的当前日期区间
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
      const sDate = rawData.dates[startIdx];
      const eDate = rawData.dates[endIdx];
      
      chart.setOption({
        title: { text: `数据区间: ${sDate} 至 ${eDate}` }
      });
    };

    chart.on('dataZoom', () => {
      updateTitleDateRange();
      // 如果不是点击按钮触发的，而是用户手动拖动/缩放，则取消所有按钮的激活状态
      if (!isTabClicking) {
        document.querySelectorAll('.chart-tabs .tab').forEach(b => b.classList.remove('active'));
      }
    });
    updateTitleDateRange();

    // 时间范围切换
    document.querySelectorAll('.chart-tabs .tab').forEach((btn) => {
      (btn as HTMLElement).addEventListener('click', async function () {
        isTabClicking = true;
        const range = this.dataset.range;

        // 3D 模式
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

        if (range === 'compare') {
          switchToCompare();
          isTabClicking = false;
          return;
        }

        // 如果当前在对比模式，先切回趋势
        if (currentMode === 'compare') {
          switchToTrend();
        }
        
        if (range === 'all') {
          chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
        } else {
          const calDays = parseInt(range!);
          // 按自然日计算：从最新日期往前找 calDays 天内的数据
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
        // 触发 action 后不会自动调回调，需手动更新一次 title
        setTimeout(() => {
          updateTitleDateRange();
          isTabClicking = false;
        }, 50); 
      });
    });

    window.addEventListener('resize', () => {
      chart.resize();
      if (chart3D) chart3D.resize();
    });

    // 默认展示近30天
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
