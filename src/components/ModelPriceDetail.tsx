import type { ModelPricing } from '../api/queries'
import { axisLabel, axisPriceText, extraAxes, tierCondition, tierPrices } from '../lib/model-pricing'

/**
 * The unfolded price table under one model row: the charging axes beyond
 * input and output, then each conditional band. Shared by the approval picker
 * and the key holder's model list so both read a model's bill the same way.
 */
export function ModelPriceDetail({ modelId, pricing }: { modelId: string; pricing: ModelPricing }) {
  const extra = extraAxes(pricing)
  return (
    <div className="space-y-1 px-2 pb-2 text-xs text-neutral-600">
      {extra.length > 0 && (
        <div role="group" aria-label={`${modelId} 가격 축`}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3">
            {extra.map((axis) => (
              <div key={axis.axis} className="contents">
                <dt className="text-neutral-500">{axisLabel(axis.axis)}</dt>
                <dd className="tabular-nums">{axisPriceText(axis)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {pricing.tiers.length > 0 && (
        <ul aria-label={`${modelId} 구간 가격`} className="space-y-0.5">
          {pricing.tiers.map((tier, index) => (
            <li key={index}>
              <span className="text-neutral-500">{tierCondition(tier)}:</span> {tierPrices(tier)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
