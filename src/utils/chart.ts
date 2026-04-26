/**
 * ECharts 价格走势图模块
 * 独立模块，避免内联重复，单次加载 ECharts
 */

interface ChartData {
  dates: string[];
  metal: number[];
  oxide: number[];
  waste: number[];
}

let echartsLoaded = false;
let echartsLib: any = null;

/** 加载 ECharts（仅一次） */
async function loadECharts(): Promise<any> {
  if (echartsLib) return echartsLib;
  if (echartsLoaded) {
    // 等待上一个加载完成
    return new Promise<any>((resolve) => {
      const check = () => {
        if (echartsLib) return resolve(echartsLib);
        setTimeout(check, 50);
      };
      check();
    });
  }
  echartsLoaded = true;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js';
    script.onload = () => {
      echartsLib = (window as any).echarts;
      resolve(echartsLib);
    };
    script.onerror = () => reject(new Error('ECharts CDN load failed'));
    document.head.appendChild(script);
  });
}

function buildOption(echarts: any, data: ChartData) {
  const { dates, metal, oxide, waste } = data;
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 13 },
      formatter(params: any[]) {
        let s = `<b>${params[0].axisValue}</b><br/>`;
        for (const p of params) {
          s += `${p.marker} ${p.seriesName}：<b>${p.value.toLocaleString()}</b> 元/吨<br/>`;
        }
        return s;
      }
    },
    legend: {
      data: ['金属镨钕', '氧化镨钕', '废料镨钕'],
      top: 5, textStyle: { color: '#94a3b8', fontSize: 12 }
    },
    grid: { left: 75, right: 20, top: 45, bottom: 25 },
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
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }
    },
    series: [
      {
        name: '金属镨钕', type: 'line', data: metal, smooth: true,
        symbol: 'circle', symbolSize: 4, showSymbol: false,
        lineStyle: { width: 2.5, color: '#f97316' },
        itemStyle: { color: '#f97316' },
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

    // 时间范围切换
    document.querySelectorAll('.chart-tabs .tab').forEach((btn) => {
      (btn as HTMLElement).addEventListener('click', function () {
        document.querySelectorAll('.chart-tabs .tab').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const range = this.dataset.range;
        if (range === 'all') {
          chart.setOption(buildOption(echarts, rawData), true);
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
        }
      });
    });

    window.addEventListener('resize', () => chart.resize());
  } catch {
    container.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:60px;">图表加载失败，请刷新页面重试</p>';
  }
}
