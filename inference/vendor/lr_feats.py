"""Features for the tiny LR student (shared by training, eval and the MCU export)."""
import re, numpy as np, scipy.sparse as sp, sys
sys.path.insert(0, "/workspace/sally-model/rules")
from sally_rules import check
from sklearn.feature_extraction.text import HashingVectorizer
BITS = 16
def make(bits):
    global HV, HVW
    HV = HashingVectorizer(analyzer="char_wb", ngram_range=(3, 5), n_features=2 ** bits, alternate_sign=False, norm="l2")
    HVW = HashingVectorizer(analyzer="word", ngram_range=(1, 1), n_features=2 ** bits, alternate_sign=False, norm="l2")
make(BITS)
toks = lambda s: set(re.findall(r'[a-z]+', s.lower()))
def rule_feats(l, p):
    c = check(l, p); r = c['ratio']
    f = [c['verdict'] == 'reject', c['verdict'] == 'ok', c['verdict'] == 'unknown', any('type' in x for x in c['reasons']), any('form' in x for x in c['reasons']),
         any('size' in x for x in c['reasons']), r is not None, r is not None and 0.5 <= r <= 2, r is not None and (r < .5 or r > 2), c['flags']['organic'], c['flags']['own_label'], c['flags']['premium']]
    lt, pt = toks(l), toks(p); j = len(lt & pt) / max(1, len(lt | pt)); cov = len(lt & pt) / max(1, len(lt))
    return np.array(f + [j, cov, cov == 1.0, len(pt - lt) / 10], dtype=np.float32)
def featurize(pairs):
    L = [l for l, _ in pairs]; P = [p for _, p in pairs]
    shared = [' '.join(sorted(toks(l) & toks(p))) for l, p in pairs]; extra = ['X' + ' X'.join(sorted(toks(p) - toks(l))) for l, p in pairs]; miss = ['M' + ' M'.join(sorted(toks(l) - toks(p))) for l, p in pairs]
    R = sp.csr_matrix(np.stack([rule_feats(l, p) for l, p in pairs]))
    return sp.hstack([HV.transform(shared), HVW.transform(extra), HVW.transform(miss), 0.5 * HV.transform(L), R]).tocsr()
