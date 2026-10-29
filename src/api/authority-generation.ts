let generation = 0

export function getAuthorityGeneration(): number { return generation }
export function advanceAuthorityGeneration(): void { generation += 1 }
