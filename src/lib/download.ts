/**
 * 개인키를 파일로 저장한다.
 *
 * 서버는 개인키를 JSON으로 돌려주고 파일 조립은 클라이언트가 한다. 응답을
 * octet-stream 첨부로 바꾸면 타입 클라이언트·problem+json 오류 처리·재인증
 * 재시도 미들웨어가 전부 이 경로만 예외로 다뤄야 하므로, 평범한 JSON 응답을
 * 유지하고 저장만 여기서 처리한다.
 */
export function savePem(privateKey: string, fileName: string): void {
  const blob = new Blob([privateKey], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}
