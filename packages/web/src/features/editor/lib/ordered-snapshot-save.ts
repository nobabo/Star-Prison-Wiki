export class OrderedSnapshotTracker {
    private issued = 0
    private committed = 0

    begin(): number {
        this.issued += 1
        return this.issued
    }

    accept(attempt: number): boolean {
        if (attempt < this.committed) return false
        this.committed = attempt
        return true
    }

    reset(): void {
        this.issued = 0
        this.committed = 0
    }
}
