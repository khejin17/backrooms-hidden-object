# THE BACKROOMS — 숨은그림 찾기

끝없이 이어지는 노란 방(백룸)을 손동작으로 돌아다니며, 숨어있는 **8가지 요소**를 찾는 3D 웹 게임.

## 특징
- **무한 맵** — 격자 기둥 공간이 청크 단위로 무한히 생성/해제됩니다.
- **8가지 숨은 요소** — 낡은 형광등 · 백룸 벽지 · 축축한 카펫 · 금속 선반 · 사무용 의자 · 백룸 사인 · 파일 캐비닛 · 백룸 출입문. 통로 곳곳에 시드 기반으로 배치되어, 가까이서 정면으로 보면 노란 헤일로가 켜지고 선택할 수 있습니다.
- **백룸 무드** — 절차적으로 만든 노란 벽지/카펫/천장 텍스처, 노란 안개, 깜빡이는 형광등, 비네트·필름 그레인.
- **손동작 조작** — `mediapipe/tasks-vision` HandLandmarker로 손을 추적합니다.

## 조작
| 손동작 | 동작 | 키보드 |
|---|---|---|
| 손 위로 | 전진 | W |
| 손 아래로 | 후진 | S |
| 손 좌/우 | 좌우 회전 | ← → / 마우스 |
| 엄지+검지 꼬집기 | 요소 선택 | E / 클릭 |

## 기술
- 순수 HTML / CSS / JavaScript (빌드 과정 없음)
- 3D: [three.js](https://threejs.org) (CDN, importmap)
- 손 추적: [@mediapipe/tasks-vision](https://developers.google.com/mediapipe) (CDN)
- 그 외 프레임워크·의존성 없음

## 실행
정적 파일이라 아무 정적 서버로 열면 됩니다. (웹캠은 `https` 또는 `localhost`에서만 동작)

```bash
npx serve .
# 또는
python3 -m http.server 8000
```

## GitHub Pages 배포
이 폴더의 내용을 리포지토리 루트(또는 `/docs`)에 올리고 Pages를 켜면 됩니다.
`three.js`와 `mediapipe`는 CDN에서 로드되므로 별도 번들링이 필요 없습니다.
GH Pages는 `https`라서 웹캠 손동작도 그대로 동작합니다.
