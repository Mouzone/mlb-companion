export interface StatBenchmark {
  readonly percentile: number
  readonly sampleSize: number
  readonly cohort: string
}

export function percentileBenchmark(
  value: number | null,
  cohortValues: readonly number[],
  lowerIsBetter: boolean,
  cohort: string,
): StatBenchmark | undefined {
  if (value === null || !Number.isFinite(value)) return undefined
  const values = cohortValues.filter(Number.isFinite)
  if (values.length === 0) return undefined

  const lowerCount = values.filter((candidate) => candidate < value).length
  const equalCount = values.filter((candidate) => candidate === value).length
  const rawPercentile = ((lowerCount + equalCount / 2) / values.length) * 100
  const percentile = lowerIsBetter ? 100 - rawPercentile : rawPercentile

  return { percentile, sampleSize: values.length, cohort }
}
