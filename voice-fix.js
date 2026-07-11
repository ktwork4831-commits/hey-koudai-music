// iPhoneの音声認識が途中結果と確定結果を複数回返し、
// 「次」が二重実行される問題を防ぐ。
if (typeof recognition !== "undefined" && recognition) {
  recognition.interimResults = false;
  recognition.onresult = event => {
    const latest = event.results[event.results.length - 1];
    if (!latest || !latest.isFinal) return;

    const alternatives = [...latest]
      .map(result => result.transcript)
      .filter(Boolean);

    for (const text of alternatives) {
      if (executeVoiceCommand(text)) break;
    }
  };
}
