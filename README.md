# Univ_Pass

대학 입시 분석 시스템 — 수시 합격 확률 분석 도구

## 기능

- **학생부 분석**: 이미지/텍스트/PDF 업로드 → OCR + LLM으로 6개 항목(학업역량, 학습태도, 진로역량, 진로탐색활동, 인성, 리더십) 자동 채점
- **전형 선택**: 학생부교과 / 학생부종합 탭 지원 (각 전형별 가중치 및 합격컷 상이)
- **합격 확률 분석**: 입력한 내신등급과 학생부 점수를 각 대학의 기준과 비교하여 합격 확률 계산
- **대학별 기준 관리**: 각 대학의 학과별 가중치, 합격컷, 등급 변환표, 입학처 URL 등을 관리

## 설치 및 실행 (Windows 완전 초보용)

아래 단계를 순서대로 따라하면 누구나 실행할 수 있습니다.

### 1. Node.js 설치

이 프로그램은 Node.js라는 실행 환경이 필요합니다. 아직 설치하지 않았다면:

1. https://nodejs.org 에 접속
2. 왼쪽의 **LTS** 권장 버전(예: 20.x.x)을 클릭하여 다운로드
3. 다운로드한 설치 파일을 실행
4. 설치 중 **모두 기본값으로 두고 Next → Install** (특별히 건드릴 것 없음)
5. 설치 완료 후 명령 프롬프트(CMD)나 PowerShell을 **새로** 열어서 아래 명령어로 정상 설치 확인:
   ```
   node --version
   npm --version
   ```
   버전 번호가 출력되면 성공입니다.

### 2. 프로그램 다운로드

두 가지 방법 중 하나를 선택하세요.

**방법 A — ZIP 다운로드 (초보자 추천)**
1. https://github.com/justfly32/Univ_Pass 에 접속
2. 초록색 `<> Code` 버튼 → **Download ZIP**
3. 다운로드한 ZIP 파일을 원하는 폴더에 압축 풀기 (예: `C:\Univ_Pass`)

**방법 B — Git Clone (개발자용)**
```bash
git clone https://github.com/justfly32/Univ_Pass.git
cd Univ_Pass
```

### 3. 패키지 설치

명령 프롬프트(CMD) 또는 PowerShell을 열고, 압축 푼 폴더로 이동한 후:

```bash
cd C:\Univ_Pass       # 실제 압축 푼 경로로 변경
npm install
```

`npm install` 명령어가 프로그램 실행에 필요한 부속 파일들을 자동으로 다운로드합니다.  
인터넷 속도에 따라 1~3분 정도 소요되며, 완료되면 `node_modules` 폴더가 생성됩니다.

### 4. 환경 설정 (선택사항)

```bash
copy .env.example .env
```

> 학생부 이미지 분석(OCR) 기능을 사용하려면 `.env` 파일을 열어 `OPENROUTER_API_KEY=` 뒤에 API 키를 입력하세요.  
> 키가 없어도 기본 기능(내신등급 입력 → 합격 확률 분석)은 정상 작동합니다.

### 5. 실행

```bash
npm start
```

터미널에 아래 메시지가 뜨면 성공입니다:
```
Univ_Pass 서버가 http://localhost:3000 에서 실행 중입니다.
```

### 6. 사용

웹 브라우저(Chrome, Edge 등)를 열고 주소창에 `http://localhost:3000` 입력 → 분석 화면 사용 시작!

### 문제 해결

| 문제 | 해결 방법 |
|------|-----------|
| `node' is not recognized` | Node.js가 설치되지 않았거나 설치 후 터미널을 재시작하지 않음 |
| `npm install` 실패 | 인터넷 연결 확인, 방화벽/보안 프로그램 일시 중지 후 재시도 |
| `PORT 3000 already in use` | 3000번 포트가 이미 사용 중이면 `.env` 파일에서 `PORT=3001` 등으로 변경 |
| 한글 깨짐 | 터미널에서 `chcp 65001` 입력 후 다시 실행 |

## 환경 변수

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `OPENROUTER_API_KEY` | 아니오 | `''` | OpenRouter API 키 (학생부 OCR 분석용) |
| `OPENROUTER_MODEL` | 아니오 | `nvidia/nemotron-3-nano-30b-a3b:free` | OpenRouter 모델 ID |

> 학생부 이미지/텍스트 분석 기능은 OpenRouter 무료 모델로도 동작합니다.

## 입결 데이터

`uploads/seoul_national-cutoff.xlsx` — 대학어디가 수시입결 데이터 (2020~2024)  
교과/종합 전형별 70% 컷 기준으로 합격컷 자동 설정

## 기술 스택

- **Backend**: Node.js, Express, EJS
- **OCR**: Tesseract.js
- **LLM**: OpenRouter API
- **데이터**: JSON 파일 기반 저장 (universities.json, user_overrides.json)
