//! solver_min7 — min-of-7 timing harness for the hyperplane solver (C3 gate).
//!
//! Non-vacuity:
//! - CountingAlloc probe asserts the hot path performs ZERO allocations.
//! - black_box sink consumes every verdict so no round is dead-code-eliminated.
//! - min-of-7 Instant rounds; each round times the full 20k-frame corpus loop.
//! - solver-vs-oracle agreement asserted before timing (timing a wrong solver
//!   would carry zero bits).

use std::alloc::{GlobalAlloc, Layout, System};
use std::hint::black_box;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use repop_kernel::{
    evaluate, GEO_RADIUS_F64, GPM_RATE_F64, METRIC_WORD_GEO, METRIC_WORD_GPM, METRIC_WORD_NTE,
    NTE_LIMIT_F64, VerdictCode,
};

/// Allocation-counting global allocator: counts every alloc; the gate asserts
/// the count is exactly 0 over the hot loop.
struct CountingAlloc;

static ALLOC_COUNT: AtomicU64 = AtomicU64::new(0);

// SAFETY: forwards to System alloc/dealloc; counts on alloc only.
unsafe impl GlobalAlloc for CountingAlloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        ALLOC_COUNT.fetch_add(1, Ordering::Relaxed);
        unsafe { System.alloc(layout) }
    }
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        unsafe { System.dealloc(ptr, layout) }
    }
}

#[global_allocator]
static GLOBAL: CountingAlloc = CountingAlloc;

/// SplitMix64 — same corpus as the kernel differential court (R4/E15 seed).
struct SplitMix64(u64);

impl SplitMix64 {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49A3_3DC1_DC43);
        z ^ (z >> 31)
    }

    fn metric(&mut self) -> f64 {
        let r = self.next();
        match r % 8 {
            0 | 1 | 2 => (r % 4_000_000) as f64,
            3 => (r % 4_000_000) as f64 * 1e-6,
            4 => -((r % 1000) as f64),
            5 => f64::from_bits(r & 0x7FF0_0000_0000_0000),
            6 if r & 1 == 0 => f64::NAN,
            _ => (r % 2_000_000) as f64,
        }
    }
}

fn build_corpus(n: usize) -> Vec<[u64; 8]> {
    let mut rng = SplitMix64(0xA20C_0FFE_E5A7_E000);
    let mut corpus = Vec::with_capacity(n);
    for _ in 0..n {
        let (nte, gpm, geo) = (rng.metric(), rng.metric(), rng.metric());
        let mut frame = [0u64; 8];
        frame[METRIC_WORD_NTE] = nte.to_bits();
        frame[METRIC_WORD_GPM] = gpm.to_bits();
        frame[METRIC_WORD_GEO] = geo.to_bits();
        corpus.push(frame);
    }
    corpus
}

/// Naive scalar oracle — identical to the kernel differential oracle.
fn oracle(nte: f64, gpm: f64, geo: f64) -> u8 {
    if nte.is_nan() || gpm.is_nan() || geo.is_nan() {
        return 0xFF;
    }
    if nte > NTE_LIMIT_F64 {
        return 1;
    }
    if gpm > GPM_RATE_F64 {
        return 2;
    }
    if geo > GEO_RADIUS_F64 {
        return 3;
    }
    0
}

fn main() {
    // Gate 1: differential correctness before timing.
    let corpus = build_corpus(20_000);
    for (i, frame) in corpus.iter().enumerate() {
        let got = evaluate(frame).as_u8();
        let want = oracle(
            f64::from_bits(frame[METRIC_WORD_NTE]),
            f64::from_bits(frame[METRIC_WORD_GPM]),
            f64::from_bits(frame[METRIC_WORD_GEO]),
        );
        assert_eq!(
            got, want,
            "differential FAILED at corpus idx {i} — refusing to time a wrong solver"
        );
    }
    println!("GATE differential: PASS (20000 frames, seed 0xA20C_0FFE_E5A7_E000)");

    // Gate 2: hot-path allocation probe (must be exactly zero).
    ALLOC_COUNT.store(0, Ordering::Relaxed);
    let mut sink: u64 = 0;
    for frame in black_box(&corpus) {
        let v: VerdictCode = evaluate(black_box(frame));
        sink = sink.wrapping_add(v.as_u8() as u64);
    }
    let allocs = ALLOC_COUNT.load(Ordering::Relaxed);
    assert_eq!(
        allocs, 0,
        "hot path allocated {allocs} times — zero-alloc law violated"
    );
    println!("GATE allocations: PASS (0 allocations on the 20000-frame hot path)");

    // Min-of-7 Instant rounds over the same corpus.
    let mut best = u128::MAX;
    for round in 1..=7 {
        ALLOC_COUNT.store(0, Ordering::Relaxed);
        let t0 = Instant::now();
        for frame in black_box(&corpus) {
            let v = evaluate(black_box(frame));
            sink = sink.wrapping_add(v.as_u8() as u64);
        }
        let dt = t0.elapsed();
        if dt.as_nanos() < best {
            best = dt.as_nanos();
        }
        println!("round {round}: {} ns", dt.as_nanos());
    }
    println!("sink (black_box consumed): {sink}");
    println!(
        "MIN-OF-7: {best} ns for 20000 frames = {} ns/frame",
        best / 20_000
    );
}
