export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <section className="rules-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="10.5のルール">
        <header>
          <h2>📖 10.5 のルール</h2>
          <button onClick={onClose} aria-label="ルールを閉じる">×</button>
        </header>
        <div className="rules-body">
          <h3>ゲームの目的</h3>
          <p>カード合計を10.5に近づけます。終了時にBUSTがいればBUSTした人が負け。BUSTがいなければ合計が最も小さい人が負けです。</p>

          <h3>1. カード配布</h3>
          <p>各プレイヤーに最初の1枚を非公開で配ります。場札は2〜3人=5枚、4〜5人=6枚、6人以上=7枚です。</p>

          <h3>2. カードの数値</h3>
          <p>A=1、2〜10=数字どおり、J/Q/K=0.5です。</p>

          <h3>3. 場札オークション</h3>
          <p>ホストが場札を1枚ずつ公開。欲しい人は「1口」「2口」…と口頭で競り上げ、次の人は前より大きい口数を言います。</p>

          <h3>4. 最終オークション</h3>
          <p>競りが止まったら「せーの」で同時に口数を発言。直前の最高口数より大きい数字が必要で、最大の人がその口数を飲みカードを獲得します。</p>

          <h3>5. 同数なら再オークション</h3>
          <p>最大口数が同数なら、その人たちだけでさらに大きい口数を発言します。誰も発言しなければカードはTRASH、1人だけなら即獲得です。</p>

          <h3>6. ホストの記録</h3>
          <p>発言自体は口頭です。ホストが最終的な獲得者と口数、またはTRASHをアプリに記録します。</p>

          <h3>7. BUST</h3>
          <p>合計11以上でBUST。本人の画面だけに表示され、ゲーム終了までは他プレイヤーには伏せられます。</p>

          <h3>8. 10.5宣言</h3>
          <p>合計がちょうど10.5なら宣言できます。宣言すると最初のカードだけが全員に公開され、ゲームは続行します。</p>

          <h3>9. ゲーム終了</h3>
          <p>ホストが終了すると全員のカードを公開します。BUSTがいればBUSTした人、いなければ合計が最も低い人が負けです。</p>

          <h3>10. 負けの口数</h3>
          <p>基本4口。10.5宣言者が1人増えるごとに+4口。同点負けの場合は合計口数を人数で分割します。</p>
        </div>
      </section>
    </div>
  )
}
