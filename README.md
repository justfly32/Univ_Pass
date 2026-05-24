# Univ_Pass

대학 입시 분석 시스템 — 수시 합격 확률 분석 도구

## 기능

- **학생부 분석**: 이미지/텍스트/PDF 업로드 → OCR + LLM으로 6개 항목(학업역량, 학습태도, 진로역량, 진로탐색활동, 인성, 리더십) 자동 채점
- **전형 선택**: 학생부교과 / 학생부종합 탭 지원 (각 전형별 가중치 및 합격컷 상이)
- **합격 확률 분석**: 입력한 내신등급과 학생부 점수를 각 대학의 기준과 비교하여 합격 확률 계산
- **대학별 기준 관리**: 각 대학의 학과별 가중치, 합격컷, 등급 변환표, 입학처 URL 등을 관리

## 설치 및 실행

```bash
npm install
cp .env.example .env  # 필요시 API 키 설정
npm start
```

기본 실행 주소: `http://localhost:3000`

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
