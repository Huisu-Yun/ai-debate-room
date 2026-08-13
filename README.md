# AI 토론방

주제를 입력하면 GPT, Gemini(그리고 나중에 키를 추가하면 Claude까지)가 자동으로 돌아가며 토론을 하고,
링크를 받은 사람은 누구나 들어와서 같이 의견을 남길 수 있는 웹앱입니다.

## 로컬에서 먼저 실행해보기

1. Node.js 18 이상이 설치되어 있어야 해요.
2. 이 폴더에서:
   ```
   npm install
   cp .env.example .env
   ```
3. `.env` 파일을 열어서 `OPENAI_API_KEY`, `GEMINI_API_KEY`를 채워 넣으세요. (Claude는 나중에 넣어도 됩니다.)
4. 서버 실행:
   ```
   npm start
   ```
5. 브라우저에서 `http://localhost:3000` 접속 → 주제 입력 → 방 만들기.

내 컴퓨터에서만 실행하면 나만 볼 수 있어요. 친구/가족이 링크로 들어오게 하려면 아래처럼 인터넷에 배포해야 합니다.

## 인터넷에 무료로 배포하기 (Render 기준)

Render는 무료 요금제로 카드 등록 없이 소규모 웹 서비스를 올릴 수 있어요 (트래픽이 적으면 충분합니다).

### 1단계. Render에서 배포하기
1. render.com 에서 GitHub 계정으로 로그인/가입하세요.
2. 대시보드에서 **New +** → **Web Service** 선택.
3. 이 저장소(`ai-debate-room`)를 연결하세요.
4. 설정값:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: **Free**
5. **Environment Variables** 항목에서 아래 값들을 추가하세요:
   - `OPENAI_API_KEY` = (내 OpenAI 키)
   - `GEMINI_API_KEY` = (내 Gemini 키)
   - `ANTHROPIC_API_KEY` = (나중에 발급받으면 여기 추가 후 재배포하면 클로드도 자동 참여합니다)
6. **Create Web Service** 클릭하면 몇 분 안에 `https://ai-debate-room-xxxx.onrender.com` 같은 주소가 생겨요.
7. 그 주소로 접속해서 방을 만들고, 방 안에서 "🔗 링크 공유" 버튼을 누르면 친구들에게 보낼 수 있는 링크가 복사돼요.

> 무료 요금제는 15분 정도 아무도 안 쓰면 서버가 잠들고, 다음 접속 때 30초~1분 정도 깨어나는 시간이 걸릴 수 있어요. 친구들과 쓰기엔 충분하지만, 이게 불편하면 유료 플랜으로 올리면 항상 켜져 있어요.

### Claude를 나중에 추가하고 싶을 때
Anthropic API 키를 발급받은 뒤, Render 대시보드 → Environment → `ANTHROPIC_API_KEY` 값을 넣고 저장하면
자동으로 재배포되면서 새로 만드는 방부터 클로드가 참여 가능한 AI 목록에 나타납니다.

## 비용/안전 장치
- 한 번의 자동 발언 간격은 최소 12초로 제한되어 있어요 (`server.js`의 `MIN_INTERVAL_SEC`).
- 한 방에서 메시지가 60개 쌓이면 자동 토론이 스스로 멈춰요 (`MAX_MESSAGES_DEFAULT`). 계속하고 싶으면 방에서 "재개" 버튼을 누르면 돼요.
- 방/대화 데이터는 서버의 `data/rooms.json` 파일에 저장됩니다 (별도 DB 불필요, 소규모 사용 기준).

## 폴더 구조
```
server.js         메인 서버 (방 생성/조회, 메시지, 자동 토론 진행 로직)
lib/ai.js         OpenAI / Gemini / Anthropic 호출 함수
lib/store.js      간단한 파일 기반 저장소
public/           방 만들기 화면, 토론방 화면 (프론트엔드)
```
