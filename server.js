import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  }
}

function weatherCodeToText(code) {
  if (code === 0) return "SUNNY";
  if ([1, 2, 3].includes(code)) return "CLOUDY";
  if ([45, 48].includes(code)) return "FOGGY";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "RAINY";
  if ([71, 73, 75, 85, 86].includes(code)) return "SNOWY";
  if ([95, 96, 99].includes(code)) return "STORM";
  return "NICE";
}

app.get("/", (req, res) => {
  res.send("AI Closet 서버 정상 작동 중");
});

app.get("/weather", async (req, res) => {
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current=temperature_2m,weather_code&timezone=Asia%2FSeoul";

    const response = await fetch(url);
    const data = await response.json();

    const temp = Math.round(data.current.temperature_2m);
    const code = data.current.weather_code;
    const weatherText = weatherCodeToText(code);

    res.json({
      location: "SEOUL",
      temperature: temp,
      weather: weatherText,
      label: `SEOUL, ${temp}°C ${weatherText}`,
    });
  } catch (e) {
    console.error("날씨 오류:", e);
    res.json({
      location: "SEOUL",
      temperature: 24,
      weather: "SUNNY",
      label: "SEOUL, 24°C SUNNY",
    });
  }
});

app.post("/recommend", async (req, res) => {
  try {
    const { situation, place, style, closet } = req.body;

    const prompt = `
너는 한국 패션 앱 '스윽착'의 AI 스타일리스트다.

사용자 입력:
- 상황: ${situation || "데일리"}
- 장소/맥락: ${place || ""}
- 취향: ${style || "미니멀, 세련된"}
- 옷장: ${JSON.stringify(closet || [])}

사용자 옷장에 있는 아이템을 최대한 활용해서 코디 3개를 추천해라.
각 코디는 카드에 들어갈 짧고 감각적인 제목과 설명이어야 한다.

반드시 JSON만 반환:
{
  "looks": [
    {"title": "모던 미니멀룩", "desc": "화이트 셔츠와 블랙 슬랙스를 중심으로 차분하고 세련된 분위기를 연출합니다."},
    {"title": "시티 캐주얼룩", "desc": "편안하지만 깔끔한 인상을 주는 도심형 데일리 코디입니다."},
    {"title": "스마트 데일리룩", "desc": "과하지 않으면서 활용도 높은 아이템으로 완성한 실용적인 룩입니다."}
  ],
  "comment": "오늘 상황과 취향, 그리고 옷장 아이템을 고려해 활용도 높은 코디를 추천했어요."
}
`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });

    res.json(safeJsonParse(response.output_text));
  } catch (e) {
    console.error("추천 AI 오류:", e);
    res.status(500).json({ error: "AI 추천 실패" });
  }
});

app.post("/analyze-clothes", async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64가 없습니다." });
    }

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
이 이미지는 사용자가 옷장에 등록하려는 패션 아이템이다.

카테고리는 반드시 이 중 하나:
아우터, 상의, 하의, 원피스, 신발, 소품

색상 판단 규칙:
- 초록빛이 도는 어두운 점퍼, 항공점퍼, MA-1은 반드시 "카키"
- 올리브, 밀리터리 그린, 카키 그린 계열은 반드시 "카키"
- 검정에 가까워도 초록빛이 보이면 "블랙"이 아니라 "카키"
- 청바지, 데님 계열은 "블루"
- 흰 셔츠, 흰 티셔츠는 "화이트"
- 회색 슬랙스, 차콜 팬츠는 "그레이"

색상은 반드시 이 중 하나:
블랙, 화이트, 그레이, 네이비, 블루, 베이지, 브라운, 카키, 레드, 핑크, 그린, 기타

스타일 판단 규칙:
- MA-1, 항공점퍼, 블루종, 오버핏 점퍼는 "스트릿" 또는 "캐주얼"
- 가죽 재킷, 올블랙 무드는 "시크"
- 셔츠, 슬랙스, 코트는 "미니멀" 또는 "클래식"
- 후드, 맨투맨, 데님은 "캐주얼"

스타일은 반드시 이 중 하나:
미니멀, 시크, 캐주얼, 스트릿, 포멀, 클래식, 스포티, 러블리, 기타

반드시 JSON만 반환:
{
  "category": "아우터",
  "color": "카키",
  "style": "스트릿",
  "name": "카키 MA-1 점퍼"
}
`,
            },
            {
              type: "input_image",
              image_url: imageBase64,
            },
          ],
        },
      ],
    });

    res.json(safeJsonParse(response.output_text));
  } catch (e) {
    console.error("옷 분석 AI 오류:", e);
    res.status(500).json({
      category: "아우터",
      color: "카키",
      style: "스트릿",
      name: "새 아우터",
    });
  }
});

app.post("/check", async (req, res) => {
  try {
    const { item, closet } = req.body;

    const prompt = `
너는 패션 구매 판단 AI다.

사용자가 사고 싶은 아이템:
${item}

사용자 옷장:
${JSON.stringify(closet || [])}

반드시 JSON만 반환:
{
  "result": "완벽한 활용도, 이 옷은 사도 좋습니다.",
  "comment": "기존 옷장과 잘 어울리며 여러 코디에 활용 가능합니다.",
  "synergy": "현재 보유한 아이템과 5개 이상 매치할 수 있습니다."
}
`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });

    res.json(safeJsonParse(response.output_text));
  } catch (e) {
    console.error("코디 체크 AI 오류:", e);
    res.status(500).json({ error: "코디 체크 실패" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`서버 실행됨 포트: ${PORT}`);
});