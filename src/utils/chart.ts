/**
 * ECharts 价格走势图模块
 * - 动态加载 ECharts CDN（仅一次）
 * - 带 SRI 完整性校验
 */

const ECHARTS_CDN = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js';
const ECHARTS_SRI = 'sha384-Mx5lkUEQPM1pOJCwFtUICyX45KNojXbkWdYhkKUKsbv391mavbfoAmONbzkgYPzR';

interface ChartData {
  dates: string[];
  metal: number[];
  oxide: number[];
  waste: number[];
}

let echartsLib: any = null;
let loadPromise: Promise<any> | null = null;

/** 加载 ECharts（单例，带 SRI） */
function loadECharts(): Promise<any> {
  if (echartsLib) return Promise.resolve(echartsLib);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // 检查是否已由其他方式加载
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

function buildOption(echarts: any, data: ChartData) {
  const { dates, metal, oxide, waste } = data;
  
  // 极值与均线配置复用
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
      text: '', // 由事件动态更新
      right: 20,
      top: 5,
      textStyle: { color: '#f8fafc', fontSize: 13, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross', // 十字准星指示器
        label: { backgroundColor: '#1e293b' }
      },
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
      top: 5, 
      left: 75,
      textStyle: { color: '#94a3b8', fontSize: 12 },
      selected: {
        '氧化镨钕': false,
        '废料镨钕': false
      }
    },
    // 为底部 dataZoom 留出空间
    grid: { left: 75, right: 30, top: 45, bottom: 50 },
    // DataZoom 缩放控制条，优化拖动滑块的显示效果
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { 
        type: 'slider', 
        show: true, 
        bottom: 5, 
        height: 20, 
        borderColor: '#334155', 
        textStyle: { color: '#f8fafc', fontSize: 13, fontWeight: 'bold' },
        handleSize: '120%',
        handleStyle: { color: '#94a3b8', shadowBlur: 3, shadowColor: 'rgba(0,0,0,0.5)', shadowOffsetX: 1, shadowOffsetY: 1 },
        fillerColor: 'rgba(148,163,184,0.2)', // 选中范围的填充色
        dataBackground: {
          lineStyle: { color: '#475569' },
          areaStyle: { color: '#1e293b' }
        }
      }
    ],
    xAxis: {
      type: 'category', data: dates, boundaryGap: false,
      axisLabel: { rotate: 30, fontSize: 10, color: '#64748b' },
      axisLine: { lineStyle: { color: '#1e293b' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value', name: '元/吨',
      nameTextStyle: { color: '#64748b', fontSize: 11 },
      axisLabel: {
        color: '#64748b', fontSize: 11,
        formatter: (v: number) => (v / 10000).toFixed(0) + '万'
      },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      scale: true // 允许 Y 轴不从 0 开始
    },
    series: [
      {
        name: '金属镨钕', type: 'line', data: metal, smooth: true,
        symbol: 'circle', symbolSize: 4, showSymbol: false,
        lineStyle: { width: 2.5, color: '#f97316' },
        itemStyle: { color: '#f97316' },
        markPoint: markPointConfig,
        markLine: markLineConfig,
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(249,115,22,0.2)' },
          { offset: 1, color: 'rgba(249,115,22,0)' }
        ])}
      },
      {
        name: '氧化镨钕', type: 'line', data: oxide, smooth: true,
        symbol: 'circle', symbolSize: 4, showSymbol: false,
        lineStyle: { width: 2.5, color: '#38bdf8' },
        itemStyle: { color: '#38bdf8' },
        markPoint: markPointConfig,
        markLine: markLineConfig,
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(56,189,248,0.15)' },
          { offset: 1, color: 'rgba(56,189,248,0)' }
        ])}
      },
      {
        name: '废料镨钕', type: 'line', data: waste, smooth: true,
        symbol: 'circle', symbolSize: 4, showSymbol: false,
        lineStyle: { width: 2.5, color: '#a78bfa' },
        itemStyle: { color: '#a78bfa' },
        markPoint: markPointConfig,
        markLine: markLineConfig,
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(167,139,250,0.15)' },
          { offset: 1, color: 'rgba(167,139,250,0)' }
        ])}
      }
    ]
  };
}

/** 初始化图表 */
export async function initChart(containerId: string, rawData: ChartData) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const echarts = await loadECharts();
    const chart = echarts.init(container, 'dark');
    chart.setOption(buildOption(echarts, rawData));

    // 动态更新右上角显示的当前日期区间
    const updateTitleDateRange = () => {
      const opt = chart.getOption();
      if (!opt.dataZoom || !opt.dataZoom.length) return;
      const dz = opt.dataZoom[0]; // inside的
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
        title: {
          text: `区间: ${sDate} 至 ${eDate}`
        }
      });
    };

    // 监听缩放事件更新标题
    chart.on('dataZoom', updateTitleDateRange);
    // 初始化时调用一次
    updateTitleDateRange();

    // 时间范围切换
    document.querySelectorAll('.chart-tabs .tab').forEach((btn) => {
      (btn as HTMLElement).addEventListener('click', function () {
        document.querySelectorAll('.chart-tabs .tab').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const range = this.dataset.range;
        if (range === 'all') {
          chart.setOption(buildOption(echarts, rawData), true);
          updateTitleDateRange();
        } else {
          const days = parseInt(range);
          const startIdx = Math.max(0, rawData.dates.length - days);
          const sliced: ChartData = {
            dates: rawData.dates.slice(startIdx),
            metal: rawData.metal.slice(startIdx),
            oxide: rawData.oxide.slice(startIdx),
            waste: rawData.waste.slice(startIdx),
          };
          chart.setOption(buildOption(echarts, sliced), true);
          updateTitleDateRange();
        }
      });
    });

    window.addEventListener('resize', () => chart.resize());
  } catch {
    container.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:60px;">图表加载失败，请刷新页面重试</p>';
  }
}