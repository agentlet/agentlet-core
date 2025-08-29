/**
 * Mock for pdfjs-dist library for Jest testing
 */

const mockPDFDocument = {
  numPages: 3,
  getPage: jest.fn().mockResolvedValue({
    getViewport: jest.fn().mockReturnValue({
      width: 595,
      height: 842
    }),
    render: jest.fn().mockReturnValue({
      promise: Promise.resolve()
    })
  })
};

const mockLoadingTask = {
  promise: Promise.resolve(mockPDFDocument),
  onProgress: jest.fn(),
  onPassword: jest.fn(),
  destroy: jest.fn()
};

export const getDocument = jest.fn().mockReturnValue(mockLoadingTask);

export const GlobalWorkerOptions = {
  workerSrc: '',
  verbosity: 0
};

export const version = '5.4.54';

export default {
  getDocument,
  GlobalWorkerOptions,
  version
};