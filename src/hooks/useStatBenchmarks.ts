import { useEffect, useState } from 'react'
import {
  fetchActiveBenchmarkCohorts,
  type ActiveBenchmarkCohorts,
  type BenchmarkScope,
} from '../api/benchmarks'

interface StatBenchmarksState {
  readonly cohorts: ActiveBenchmarkCohorts | null
  readonly loading: boolean
}

const currentYear = new Date().getFullYear().toString()

export function useStatBenchmarks(scope: BenchmarkScope): StatBenchmarksState {
  const [state, setState] = useState<StatBenchmarksState>({ cohorts: null, loading: true })

  useEffect(() => {
    let active = true
    setState((previous) => ({ ...previous, loading: true }))

    void fetchActiveBenchmarkCohorts(scope, currentYear).then(
      (cohorts) => {
        if (active) setState({ cohorts, loading: false })
      },
      () => {
        if (active) setState({ cohorts: null, loading: false })
      },
    )

    return () => {
      active = false
    }
  }, [scope])

  return {
    cohorts: state.cohorts?.scope === scope ? state.cohorts : null,
    loading: state.loading,
  }
}
