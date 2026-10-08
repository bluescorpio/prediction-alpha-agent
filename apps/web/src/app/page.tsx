// 脚手架写的是 ../../../services，从 app/ 出发少一层，这里改到仓库根。
import { load } from "../../../../services/ingest/src/store.js"; // TODO: 改为读后端 API

export default function Home() {
  const signals = load<{ id: string; eventRef: { question: string } }>("signals");
  return (
    <main style={{ maxWidth: 760, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Prediction Alpha Agent</h1>
      <p>把预测市场与永续定价的分歧，变成可执行、可验证的信号。</p>
      <h2>信号列表</h2>
      {signals.length === 0 ? (
        <p style={{ color: "#888" }}>暂无信号。先运行 ingest 与 signals。</p>
      ) : (
        <ul>
          {signals.map((s) => (
            <li key={s.id}>{s.eventRef.question}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
