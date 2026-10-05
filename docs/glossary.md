# Glossary

The words FOIL's interface uses, one name for each thing, in both languages. The texts live in
`src/i18n/ja.ts` and `src/i18n/en.ts` (plus the binder's and the APNG button's own short lists in
`src/binder/binder.ts` and `src/anim/apngUi.ts`). When a text names one of these things, it uses the
name below.

## Things on the card

| ja | en | Meaning |
| --- | --- | --- |
| カード | Card | The card on the stage, and the first Fine-tune tab (strength, frame, shape, layout, pixelate, backdrop). |
| 画像 | Picture | The picture you open (or a sample). Also the second picture of Flip Lenticular (傾けると出る画像 / Picture shown on tilt). |
| イラスト | Art | The art window of the card, where the picture shows. As an area: only inside it. |
| 窓 | Window | The box in the crop view that you drag to choose what the card shows. Never 枠 / Frame, which is the card's border. |
| 枠 | Frame | The card's border and its color. |
| 形 | Shape | Trading card, wide, square, postcard upright or on its side, business card, and 画像の形 / Picture (the picture's own proportions). |
| カードそのものとして使う | Use as the whole card | The picture is the whole card: no frame, nameplate or words of FOIL's, only the finish on it. |
| 名前 | Name | The card's name on its nameplate. Not カード名. |
| 名札 | Nameplate | The band holding the name and rarity. |
| レアリティ | Rarity | Common to Legendary, shown as ◆. Not レア度. |
| メッセージ | Message | Up to four lines of words on the card. |
| 種別 / 効果文 | Type line / Card text | The two texts of the trading-card layout. Not "effect text" in English. |
| 帯 | Band | The plate a trading card's name and type line sit on. |

## Finishes and where they go

| ja | en | Meaning |
| --- | --- | --- |
| 加工 | Finish | One of the 36 effects (Foil, Holographic…). Only finishes are 加工; the way words are printed is 刷り方. |
| 加工の強さ | Finish strength | How strongly the finish shows. Not 効果の強さ. |
| 輝き | Shine | The Fine-tune tab for pattern, light and motion. |
| 手札 / デッキ / パック | Hand / Deck / Pack | Up to seven finishes to pick from / the other owned finishes / a theme set opened once. |
| レイヤー | Layer | One of up to two finishes on the card (レイヤー 1, レイヤー 2), and the tab that sets them. |
| 範囲 | Area | Where a layer's finish goes: 全体 / イラスト / 枠 / 名前 / なし, narrowed by brightness, inverted, or painted. Not 場所 or 加工の範囲. |
| 明るさ | Brightness | The tone band of the picture a finish keeps to: 明るい所 / 中間の明るさ / 暗い所 (Highlights / Midtones / Shadows). |
| ブラシ | Brush | Paints the area in (足す / Add) or out (消す / Erase). Its size is 大きさ / Size. |

## Lettering

| ja | en | Meaning |
| --- | --- | --- |
| 文字 | Lettering | The words on the card (name, type line, message, card text), and the Fine-tune tab for them. |
| 刷り方 | Print | How words are printed: 印刷 / Ink, 型押し / Deboss, 浮き出し / Emboss, 箔押し / Hot foil, スポット UV / Spot UV. |
| 文字の刷り方 | Lettering (print) | The card's own print, shared by every piece of text that has none of its own. |
| 個別 / カードに合わせる | own / Match the card | A piece of text with a print of its own / following the card's print. |
| 文字色 / 箔の色 | Ink color / Foil | The ink of 印刷, the foil of 箔押し. |
| 凹凸 / 光沢 | Depth / Gloss | How deep the print is, how shiny. Not "Relief" in English, which is a finish. |
| 配置 | Placement | おまかせ / Auto or 自由 / Free placement of the words. |
| 大きさ / 角度 | Size / Angle | The two handles of a word in free placement. Not 傾き, which is the card's tilt. |

## Light and motion

| ja | en | Meaning |
| --- | --- | --- |
| 光源 | Light source | Where the light comes from: ポインター / Pointer, 周回 / Orbit, 固定 / Fixed. |
| 光の向き | Light direction | The fixed light's angle. |
| 傾き / 傾ける | Tilt | The card leaning in 3D (pointer, hand or the device). 傾きの上限 / Max tilt caps it. |
| 動き | Motion | One of the 20 automatic motions (in four groups) or なし / None. Where it stands alone, a label says カードの動き / Card motion. |
| 動きの速さ | Motion speed | How fast the motion and its loop run (0 holds still). |
| 動きの幅 | Motion range | How far the card moves and turns (and the light travels under the Light motions). Not 動きの大きさ. |
| ループ | Loop | One cycle of the motion; a GIF or APNG is exactly one loop. |

## Saving and keeping

| ja | en | Meaning |
| --- | --- | --- |
| 書き出す | Export | Step 3: make a file. The button says 保存 / Save. |
| 書き出し形式 | File format | GIF (動く・軽い / Moving, small), APNG (動く・高画質 / Moving, full color), MP4 (動画・インスタ / Video, Instagram). |
| 透過 | Transparent | No background in the file. Never "clear" in English. |
| 背景 / 縁の色 | Backdrop / Edge color | What the card sits on, on the stage and in files (うずまき / Swirl … 透過 / Transparent), and the color a transparent GIF's cut edge blends into. |
| しまう / バインダー | Keep / Binder | Put the card in the binder, which lives in this browser. |
| ステージ | Stage | Where the card shows. ステージに出す / To stage brings a kept card back. |
| 共有 | Share | Send the card as a GIF to the device's share sheet. |

## Verbs on buttons

| ja | en | Meaning |
| --- | --- | --- |
| 初期値に戻す | Reset | Put a setting (or a tab, or the area) back to its default. Not リセット, 既定値, or 元に戻す. |
| 取り消す | Undo | Take back the last action (a stroke, a removed color, a reset, a discard). Not 元に戻す. |
| やり直す | Redo | Do again what was undone. |
| 変える | Change | Open the choice again (a step's recap, the motion). |
| 完了 / 閉じる | Done / Close | Finish a mode / close a panel or menu. |

## Page settings

| ja | en | Meaning |
| --- | --- | --- |
| CRT フィルター | CRT filter | The screen filter that makes the page look like an old CRT (rounded glass, scanlines, an RGB grille, glow). Off by default; its header button says only CRT. Never in exports. |

## Writing rules

- Short and concrete; a button says what happens when pressed.
- Japanese: natural Japanese, few katakana loanwords. A space between Japanese and Latin letters or
  numbers (`GIF を`, `4 行`). Parentheses are half-width with a space before them (`名札 (名前・レアリティ)`).
  A colon only joins a label and its value (`音: オン`); sentences never end in one (`{file} を保存しました`,
  not `保存しました: {file}`).
- English: sentence case, natural English, no abbreviations except the short format notes (`no bg`).
