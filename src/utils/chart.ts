/**
 * ECharts 价格走势图模块
 * - 动态加载 ECharts CDN（仅一次）
 * - 带 SRI 完整性校验
 * - 支持趋势图与年份对比图切换
 */

const ECHARTS_CDN = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js';
const ECHARTS_SRI = 'sha384-Mx5lkUEQPM1pOJCwFtUICyX45KNojXbkWdYhkKUKsbv391mavbfoAmONbzkgYPzR';

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
      top: 0,
      left: 'center',
      type: 'scroll', // 移动端多图例滚动
      textStyle: { color: '#94a3b8', fontSize: 12 },
      selected: years.reduce((acc, y, i) => {
        // 默认只显示最近两年
        acc[`${y}年`] = i >= years.length - 2;
        return acc;
      }, {} as Record<string, boolean>)
    },
    grid: { left: 75, right: 30, top: 60, bottom: 45 },
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
          grid: { left: 55, right: 15, top: 60, bottom: 45 },
          xAxis: { axisLabel: { fontSize: 9 } }
        }
      },
      {
        option: {
          grid: { left: 75, right: 30, top: 60, bottom: 45 }
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
      axisPointer: { type: 'cross', label: { backgroundColor: '#1e293b' } },
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
      top: 0, 
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
    grid: { left: 75, right: 30, top: 60, bottom: 65 },
    media: [
      {
        query: { maxWidth: 500 }, // 小屏专属优化
        option: {
          grid: { left: 55, right: 10, top: 70, bottom: 70 }
        }
      }
    ]
  };
}

export async function initChart(containerId: string, rawData: ChartData, compareData?: CompareData | null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const echarts = await loadECharts();
    const chart = echarts.init(container, 'dark');
    
    // 初始化配置
    chart.setOption(buildOption(rawData));

    let currentMode: 'trend' | 'compare' = 'trend';
    let isTabClicking = false;

    // 年份对比模式
    function switchToCompare() {
      if (!compareData) return;
      currentMode = 'compare';
      chart.clear();
      chart.setOption(buildCompareOption(compareData), true);
    }

    function switchToTrend() {
      currentMode = 'trend';
      chart.clear();
      chart.setOption(buildOption(rawData), true);
      updateTitleDateRange();
    }

    // 动态更新底部的当前日期区间
    const updateTitleDateRange = () => {
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
      (btn as HTMLElement).addEventListener('click', function () {
        isTabClicking = true;
        document.querySelectorAll('.chart-tabs .tab').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const range = this.dataset.range;
        const len = rawData.dates.length;

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
          const calDays = parseInt(range);
          // 按自然日计算：从最新日期往前找 calDays 天内的数据
          const parseDateStr = (s: string) => {
            const [y, m, d] = s.split('.').map(Number);
            return new Date(y, m - 1, d).getTime();
          };
          const latestMs = parseDateStr(rawData.dates[len - 1]);
          const msPerDay = 86400000;
          let startIdx = 0;
          for (let i = len - 1; i >= 0; i--) {
            if ((latestMs - parseDateStr(rawData.dates[i])) / msPerDay > calDays) {
              startIdx = i + 1;
              break;
            }
          }
          const startPct = Math.max(0, (startIdx / Math.max(1, len - 1)) * 100);
          chart.dispatchAction({ type: 'dataZoom', start: startPct, end: 100 });
        }
        // 触发 action 后不会自动调回调，需手动更新一次 title
        setTimeout(() => {
          updateTitleDateRange();
          isTabClicking = false;
        }, 50); 
      });
    });

    window.addEventListener('resize', () => chart.resize());
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:60px;">图表加载失败，请刷新页面重试</p>';
  }
}
