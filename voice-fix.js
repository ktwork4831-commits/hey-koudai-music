// iPhoneの音声認識が途中結果と確定結果を複数回返し、
// 「次」が二重実行される問題を防ぐ。
if (typeof recognition !== "undefined" && recognition) {
  recognition.lang = "ja-JP";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 5;

  recognition.onresult = event => {
    const finalResults = [...event.results].filter(result => result.isFinal);
    if (!finalResults.length) return;

    const latest = finalResults[finalResults.length - 1];
    const alternatives = [...latest]
      .map(result => result.transcript)
      .filter(Boolean);

    const combined = finalResults
      .map(result => result[0]?.transcript || "")
      .join("")
      .trim();

    if (combined) alternatives.push(combined);

    for (const text of [...new Set(alternatives)]) {
      if (executeVoiceCommand(text)) break;
    }
  };
}
