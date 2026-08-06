export class NaverProviderCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NaverProviderCapacityError";
  }
}
