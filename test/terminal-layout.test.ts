// Hydra — © 2026 José Segura (GKsegura) · MIT
import { describe, expect, it } from 'vitest';
import {
  addTab, canSplit, closeTerminal, DEFAULT_RATIO, emptyLayout, focus, MAX_RATIO, MIN_RATIO, moveToPane, normalize, setRatio, splitWith,
  unsplit, type TermLayout,
} from '../web/src/terminal-layout.ts';

/** Layout sem divisão com as abas dadas e o foco na última (como abrir vários terminais em sequência). */
const opened = (...ids: string[]) => ids.reduce(addTab, emptyLayout());

/** Confere as invariantes documentadas no módulo. */
function check(l: TermLayout) {
  expect(new Set(l.tabs).size).toBe(l.tabs.length);
  expect(l.panes.every((p) => l.tabs.includes(p))).toBe(true);
  expect(new Set(l.panes).size).toBe(l.panes.length);
  expect(l.panes.length).toBeLessThanOrEqual(2);
  if (!l.tabs.length) {
    expect(l).toEqual(emptyLayout());
    return;
  }
  expect(l.active).not.toBeNull();
  expect(l.panes).toContain(l.active);
  expect(l.split === null ? l.panes.length === 1 : l.panes.length === 2).toBe(true);
  expect(l.ratio).toBeGreaterThanOrEqual(MIN_RATIO);
  expect(l.ratio).toBeLessThanOrEqual(MAX_RATIO);
}

describe('addTab (terminal novo, sem dividir)', () => {
  it('o primeiro terminal vira o único pane, com foco', () => {
    expect(opened('a')).toEqual({ tabs: ['a'], active: 'a', split: null, panes: ['a'], ratio: DEFAULT_RATIO });
  });

  it('sem divisão, cada terminal novo toma o lugar do anterior e ganha o foco (como as abas sempre fizeram)', () => {
    const l = opened('a', 'b', 'c');
    expect(l.tabs).toEqual(['a', 'b', 'c']);
    expect(l.panes).toEqual(['c']);
    expect(l.active).toBe('c');
  });

  it('dividido, o novo ocupa o pane que estava em foco e o outro pane fica como está', () => {
    const two = splitWith(opened('a', 'b'), 'columns', 'c'); // panes b|c, foco em c
    const l = addTab(two, 'd');
    check(l);
    expect(l.split).toBe('columns');
    expect(l.panes).toEqual(['b', 'd']); // d tomou o lugar de c (o pane em foco); b ficou
    expect(l.active).toBe('d');
    expect(l.tabs).toContain('c'); // c continua como aba
  });
});

describe('splitWith (dividir)', () => {
  it('o terminal em foco fica onde está e o novo vai para o segundo pane, com o foco', () => {
    const l = splitWith(opened('a'), 'columns', 'b');
    expect(l).toEqual({ tabs: ['a', 'b'], active: 'b', split: 'columns', panes: ['a', 'b'], ratio: DEFAULT_RATIO });
    expect(splitWith(opened('a'), 'rows', 'b').split).toBe('rows');
  });

  it('usa um terminal que já é aba (menu da aba) sem duplicá-lo', () => {
    const l = splitWith(opened('a', 'b', 'c'), 'columns', 'a'); // foco em c; 'a' era só aba
    expect(l.tabs).toEqual(['a', 'b', 'c']);
    expect(l.panes).toEqual(['c', 'a']);
    check(l);
  });

  it('já dividido: troca a direção e o novo entra no pane sem foco, mantendo o outro como aba', () => {
    const two = splitWith(opened('a'), 'columns', 'b'); // panes a|b, foco b
    const l = splitWith(focus(two, 'a'), 'rows', 'c'); // foco a → o pane de b recebe c
    expect(l.split).toBe('rows');
    expect(l.panes).toEqual(['a', 'c']);
    expect(l.tabs).toEqual(['a', 'b', 'c']);
    expect(l.ratio).toBe(two.ratio);
    check(l);
  });

  it('dividir com o próprio terminal em foco só troca a direção (ou não faz nada sem divisão)', () => {
    const one = opened('a');
    expect(splitWith(one, 'columns', 'a')).toBe(one);
    const two = splitWith(one, 'columns', 'b');
    expect(splitWith(two, 'rows', 'b').split).toBe('rows');
    expect(splitWith(two, 'rows', 'b').panes).toEqual(['a', 'b']);
  });

  it('sem nenhum terminal, o novo vira o único', () => {
    expect(splitWith(emptyLayout(), 'columns', 'a')).toEqual(opened('a'));
  });
});

describe('unsplit (desfazer a divisão)', () => {
  it('fica só o terminal em foco; o outro continua como aba', () => {
    const l = unsplit(splitWith(opened('a'), 'columns', 'b'));
    expect(l).toEqual({ tabs: ['a', 'b'], active: 'b', split: null, panes: ['b'], ratio: DEFAULT_RATIO });
  });

  it('sem divisão não muda nada', () => {
    expect(unsplit(opened('a', 'b'))).toEqual(opened('a', 'b'));
  });
});

describe('closeTerminal', () => {
  it('fechar o focado de um dock dividido: o outro ocupa tudo e ganha o foco', () => {
    const l = closeTerminal(splitWith(opened('a'), 'columns', 'b'), 'b');
    expect(l).toEqual({ tabs: ['a'], active: 'a', split: null, panes: ['a'], ratio: DEFAULT_RATIO });
  });

  it('fechar o pane sem foco: o focado ocupa tudo', () => {
    const l = closeTerminal(splitWith(opened('a'), 'columns', 'b'), 'a');
    expect(l).toMatchObject({ tabs: ['b'], active: 'b', split: null, panes: ['b'] });
  });

  it('fechar uma aba que não está à vista não mexe na divisão nem no foco', () => {
    const two = splitWith(opened('a', 'x'), 'columns', 'b'); // x é aba escondida; panes x|b? foco antes era x
    const hidden = two.tabs.find((t) => !two.panes.includes(t))!;
    const l = closeTerminal(two, hidden);
    expect(l.split).toBe('columns');
    expect(l.panes).toEqual(two.panes);
    expect(l.active).toBe(two.active);
    expect(l.tabs).not.toContain(hidden);
  });

  it('sem divisão: o foco vai para a aba vizinha (a que ocupa o lugar, ou a última)', () => {
    const l = closeTerminal(focus(opened('a', 'b', 'c'), 'b'), 'b');
    expect(l).toMatchObject({ tabs: ['a', 'c'], active: 'c', panes: ['c'] });
    expect(closeTerminal(opened('a', 'b', 'c'), 'c')).toMatchObject({ tabs: ['a', 'b'], active: 'b' });
  });

  it('fechar o último terminal esvazia o layout; id desconhecido não faz nada', () => {
    expect(closeTerminal(opened('a'), 'a')).toEqual(emptyLayout());
    const l = opened('a', 'b');
    expect(closeTerminal(l, 'zzz')).toBe(l);
  });
});

describe('focus', () => {
  it('em um terminal à vista só muda o foco', () => {
    const two = splitWith(opened('a'), 'columns', 'b');
    const l = focus(two, 'a');
    expect(l.active).toBe('a');
    expect(l.panes).toEqual(two.panes);
  });

  it('em uma aba de fora, ela ocupa o pane que estava em foco', () => {
    const two = splitWith(opened('a', 'x'), 'columns', 'b'); // panes: x|b, foco b; 'a' é aba de fora
    const l = focus(two, 'a');
    expect(l.panes).toEqual(['x', 'a']);
    expect(l.active).toBe('a');
    expect(l.split).toBe('columns');
  });

  it('sem divisão troca o terminal mostrado; id desconhecido não faz nada', () => {
    expect(focus(opened('a', 'b'), 'a')).toMatchObject({ active: 'a', panes: ['a'] });
    const l = opened('a');
    expect(focus(l, 'zzz')).toBe(l);
  });
});

describe('setRatio', () => {
  it('limita a 20%–80% e ignora valores inválidos', () => {
    const l = splitWith(opened('a'), 'columns', 'b');
    expect(setRatio(l, 0.65).ratio).toBe(0.65);
    expect(setRatio(l, 0).ratio).toBe(MIN_RATIO);
    expect(setRatio(l, 5).ratio).toBe(MAX_RATIO);
    expect(setRatio(l, Number.NaN).ratio).toBe(DEFAULT_RATIO);
  });
});

describe('moveToPane', () => {
  const two = splitWith(opened('a'), 'columns', 'b'); // a|b, foco b

  it('levar um dos dois para o outro pane troca os lugares', () => {
    expect(moveToPane(two, 'b', 0).panes).toEqual(['b', 'a']);
    expect(moveToPane(two, 'a', 1)).toMatchObject({ panes: ['b', 'a'], active: 'a' });
  });

  it('levar uma aba de fora substitui o terminal daquele pane, que continua como aba', () => {
    const l = moveToPane(splitWith(opened('a', 'x'), 'columns', 'b'), 'a', 0); // panes x|b
    expect(l.panes).toEqual(['a', 'b']);
    expect(l.tabs).toContain('x');
    check(l);
  });

  it('sem divisão, ou com id desconhecido, não faz nada', () => {
    const one = opened('a', 'b');
    expect(moveToPane(one, 'a', 0)).toBe(one);
    expect(moveToPane(two, 'zzz', 0)).toBe(two);
  });
});

describe('normalize (consertar layouts velhos ou quebrados)', () => {
  it('tira terminais que sumiram do servidor e refaz o foco e a divisão', () => {
    const two = splitWith(opened('a'), 'columns', 'b');
    const l = normalize(two, ['a']); // b morreu
    expect(l).toEqual({ tabs: ['a'], active: 'a', split: null, panes: ['a'], ratio: DEFAULT_RATIO });
  });

  it('sem nenhum terminal vivo, esvazia', () => {
    expect(normalize(opened('a', 'b'), [])).toEqual(emptyLayout());
  });

  it('corrige foco fora dos panes, panes repetidos, demais de dois e proporção fora do limite', () => {
    const l = normalize({ tabs: ['a', 'b', 'c'], active: 'c', split: 'rows', panes: ['a', 'a', 'b', 'c'], ratio: 9 });
    check(l);
    expect(l.panes).toContain('c');
    expect(l.ratio).toBe(MAX_RATIO);
  });

  it('divisão com um pane só desfaz a divisão; foco desconhecido vira um pane válido', () => {
    expect(normalize({ tabs: ['a', 'b'], active: 'a', split: 'columns', panes: ['a'], ratio: 0.5 }).split).toBeNull();
    const l = normalize({ tabs: ['a', 'b'], active: 'zzz', split: null, panes: [], ratio: 0.5 });
    expect(l.active).toBe('b');
    check(l);
  });

  it('é idempotente', () => {
    const l = splitWith(opened('a', 'b'), 'rows', 'c');
    expect(normalize(l)).toEqual(l);
  });
});

describe('canSplit', () => {
  it('exige largura para lado a lado e altura para empilhar', () => {
    expect(canSplit('columns', 800, 100)).toBe(true);
    expect(canSplit('columns', 400, 900)).toBe(false);
    expect(canSplit('rows', 100, 300)).toBe(true);
    expect(canSplit('rows', 900, 200)).toBe(false);
  });
});

describe('invariantes sob operações aleatórias', () => {
  it('nunca quebram, qualquer que seja a sequência', () => {
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    let next = 0;
    let l = emptyLayout();
    for (let i = 0; i < 2000; i++) {
      const pick = () => (l.tabs.length ? l.tabs[rnd(l.tabs.length)] : 'nenhum');
      switch (rnd(8)) {
        case 0: l = addTab(l, `t${next++}`); break;
        case 1: l = splitWith(l, rnd(2) ? 'columns' : 'rows', rnd(3) ? `t${next++}` : pick()); break;
        case 2: l = unsplit(l); break;
        case 3: l = closeTerminal(l, pick()); break;
        case 4: l = focus(l, pick()); break;
        case 5: l = setRatio(l, rnd(200) / 100 - 0.5); break;
        case 6: l = moveToPane(l, pick(), rnd(2) as 0 | 1); break;
        default: l = normalize(l, l.tabs.filter(() => rnd(10) > 0)); break; // às vezes um terminal some do servidor
      }
      check(l);
    }
  });
});
