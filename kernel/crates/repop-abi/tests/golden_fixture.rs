//! Cross-language golden-byte fixture emit (C2b leg).
//!
//! SplitMix64 field values, seed 0xA20C0FFEE5A7E000 (+1/+2 per frame).
//! Emits scripts/parity_fixture.json ONLY when REPOP_EMIT_FIXTURE=1.
//! Without the env var, asserts an existing fixture matches fresh bytes.

use std::fs;
use std::path::PathBuf;

use repop_abi::frame::IntentFrame;
use repop_abi::hyperplane::HyperplaneRegister;
use repop_abi::receipt::ReceiptFrame;
use repop_abi::FRAME_SIZE;

const SEED: u64 = 0xA20C0FFEE5A7E000;

struct Mix(u64);

impl Mix {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        z ^= z >> 31;
        z
    }
}

fn f64frac(v: u64) -> f64 {
    (v & 0xFFFFFFFF) as f64 / 4294967295.0
}

fn golden_intent() -> IntentFrame {
    let mut g = Mix(SEED);
    let mut issuer = [0u8; 8];
    let mut binding = [0u8; 16];
    for b in issuer.iter_mut() {
        *b = g.next() as u8;
    }
    for b in binding.iter_mut() {
        *b = g.next() as u8;
    }
    let kind = g.next() as u16;
    let fl = g.next() as u16;
    let hp = g.next();
    let th = f64frac(g.next());
    let wt = f64frac(g.next());
    let seq = g.next() as u16;
    let mut f = IntentFrame::new(kind, hp, th, wt, issuer, binding, seq);
    f.flags = fl;
    f
}

fn golden_hyperplane() -> HyperplaneRegister {
    let mut g = Mix(SEED.wrapping_add(1));
    let mut bind = [0u8; 8];
    for b in bind.iter_mut() {
        *b = g.next() as u8;
    }
    let kind = g.next() as u16;
    let fl = g.next() as u16;
    let pid = g.next();
    let nx = f64frac(g.next());
    let ny = f64frac(g.next());
    let nz = f64frac(g.next());
    let off = f64frac(g.next());
    let ep = g.next() as u16;
    let mut h = HyperplaneRegister::new(kind, pid, [nx, ny, nz], off, bind, ep);
    h.flags = fl;
    h
}

fn golden_receipt() -> ReceiptFrame {
    let mut g = Mix(SEED.wrapping_add(2));
    let mut bind = [0u8; 32];
    for b in bind.iter_mut() {
        *b = g.next() as u8;
    }
    let mut prefix = [0u8; 16];
    for b in prefix.iter_mut() {
        *b = g.next() as u8;
    }
    let seq = g.next() as u16;
    ReceiptFrame::new_keyed_blake3(bind, prefix, seq)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../scripts/parity_fixture.json")
}

#[test]
fn golden_fixture_emit_deterministic() {
    let mut ib = [0u8; FRAME_SIZE];
    golden_intent().seal(&mut ib);
    let mut hb = [0u8; FRAME_SIZE];
    golden_hyperplane().seal(&mut hb);
    let mut rb = [0u8; FRAME_SIZE];
    golden_receipt().seal(&mut rb);

    if std::env::var("REPOP_EMIT_FIXTURE").as_deref() == Ok("1") {
        let json = format!(
            "{{\"seed\":\"0xA20C0FFEE5A7E000\",\"intent_hex\":\"{}\",\"hyperplane_hex\":\"{}\",\"receipt_hex\":\"{}\"}}\n",
            hex(&ib),
            hex(&hb),
            hex(&rb)
        );
        let p = fixture_path();
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, json).unwrap();
        println!("emitted {}", p.display());
    }

    let p = fixture_path();
    if p.exists() {
        let disk = fs::read_to_string(&p).unwrap();
        assert!(
            disk.contains(&hex(&ib)) && disk.contains(&hex(&hb)) && disk.contains(&hex(&rb)),
            "fixture stale; re-emit: REPOP_EMIT_FIXTURE=1 cargo test -p repop-abi"
        );
    }
}

#[test]
fn golden_frames_decode_back() {
    let mut buf = [0u8; FRAME_SIZE];
    let f = golden_intent();
    f.seal(&mut buf);
    assert_eq!(IntentFrame::decode(&buf).unwrap(), f);
    let h = golden_hyperplane();
    h.seal(&mut buf);
    assert_eq!(HyperplaneRegister::decode(&buf).unwrap(), h);
    let r = golden_receipt();
    r.seal(&mut buf);
    assert_eq!(ReceiptFrame::decode(&buf).unwrap(), r);
}
