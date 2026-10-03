// ========== 二叉最小堆（Dijkstra / Yen 用） ==========

class MinHeap {
    constructor() {
        this.items = [];   // [{ node, key }]
    }
    get size() { return this.items.length; }

    push(node, key) {
        const a = this.items;
        a.push({ node, key });
        let i = a.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (a[p].key <= a[i].key) break;
            [a[p], a[i]] = [a[i], a[p]];
            i = p;
        }
    }

    pop() {
        const a = this.items;
        if (a.length === 0) return null;
        const top = a[0];
        const last = a.pop();
        if (a.length > 0) {
            a[0] = last;
            let i = 0;
            const n = a.length;
            while (true) {
                const l = i * 2 + 1;
                const r = l + 1;
                let s = i;
                if (l < n && a[l].key < a[s].key) s = l;
                if (r < n && a[r].key < a[s].key) s = r;
                if (s === i) break;
                [a[i], a[s]] = [a[s], a[i]];
                i = s;
            }
        }
        return top;
    }
}