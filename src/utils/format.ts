/**
 * 价格数据工具函数
 */

/** 格式化：元/吨，带千位分隔符 */
export function fmtYuan(n: number): string {
  return n.toLocaleString('zh-CN');
}

/** ISO日期 → 展示格式 '2026-04-24' → '2026.04.24' */
export function fmtDate(iso: string): string {
  return iso.replace(/-/g, '.');
}

/** ISO日期 → 中文展示 '2026-04-24' → '4月24日' */
export function fmtDateShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${parseInt(m)}月${parseInt(d)}日`;
}

/** 计算涨跌 */
export function calcChange(cur: number, prev: number) {
  const diff = cur - prev;
  const pct = ((diff / prev) * 100).toFixed(2);
  return { diff, pct, up: diff >= 0 };
}

/** 格式化涨跌金额 */
export function fmtChgYuan(diff: number): string {
  return (diff >= 0 ? '+' : '') + diff.toLocaleString('zh-CN');
}
