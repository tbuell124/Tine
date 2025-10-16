#ifndef TINE_NATIVE_UTIL_FLOAT_RING_BUFFER_HPP
#define TINE_NATIVE_UTIL_FLOAT_RING_BUFFER_HPP

#include <atomic>
#include <cstddef>
#include <vector>

namespace tine::dsp {

/**
 * Single-producer/single-consumer lock-free ring buffer for audio frames.
 */
class FloatRingBuffer {
public:
    explicit FloatRingBuffer(std::size_t capacityFrames)
        : m_capacity(nextPowerOfTwo(capacityFrames)),
          m_mask(m_capacity - 1),
          m_buffer(m_capacity, 0.0f),
          m_writeIndex(0),
          m_readIndex(0) {}

    FloatRingBuffer(const FloatRingBuffer&) = delete;
    FloatRingBuffer& operator=(const FloatRingBuffer&) = delete;

    /**
     * Write up to @p frames samples into the ring. Returns the number written.
     */
    std::size_t write(const float* data, std::size_t frames) {
        if (!data || frames == 0) {
            return 0;
        }

        std::size_t written = 0;
        std::size_t localWrite = m_writeIndex.load(std::memory_order_relaxed);
        std::size_t localRead = m_readIndex.load(std::memory_order_acquire);
        std::size_t available = m_capacity - (localWrite - localRead);

        const std::size_t toWrite = frames > available ? available : frames;
        if (toWrite == 0) {
            return 0;
        }

        while (written < toWrite) {
            const std::size_t index = (localWrite + written) & m_mask;
            m_buffer[index] = data[written];
            ++written;
        }

        m_writeIndex.store(localWrite + written, std::memory_order_release);
        return written;
    }

    /**
     * Read up to @p frames samples from the ring. Returns frames copied.
     */
    std::size_t read(float* dst, std::size_t frames) {
        if (!dst || frames == 0) {
            return 0;
        }

        std::size_t read = 0;
        std::size_t localRead = m_readIndex.load(std::memory_order_relaxed);
        std::size_t localWrite = m_writeIndex.load(std::memory_order_acquire);
        std::size_t available = localWrite - localRead;

        const std::size_t toRead = frames > available ? available : frames;
        if (toRead == 0) {
            return 0;
        }

        while (read < toRead) {
            const std::size_t index = (localRead + read) & m_mask;
            dst[read] = m_buffer[index];
            ++read;
        }

        m_readIndex.store(localRead + read, std::memory_order_release);
        return read;
    }

    /**
     * Drops all unread data.
     */
    void reset() {
        const std::size_t current = m_writeIndex.load(std::memory_order_relaxed);
        m_readIndex.store(current, std::memory_order_relaxed);
    }

    /**
     * @return Frames currently stored in the buffer.
     */
    std::size_t available() const {
        const std::size_t localWrite = m_writeIndex.load(std::memory_order_relaxed);
        const std::size_t localRead = m_readIndex.load(std::memory_order_relaxed);
        return localWrite - localRead;
    }

    /**
     * @return Free frames available for writing.
     */
    std::size_t freeSpace() const {
        const std::size_t localWrite = m_writeIndex.load(std::memory_order_relaxed);
        const std::size_t localRead = m_readIndex.load(std::memory_order_relaxed);
        return m_capacity - (localWrite - localRead);
    }

private:
    static std::size_t nextPowerOfTwo(std::size_t value) {
        if (value == 0) {
            value = 1;
        }
        std::size_t v = 1;
        if (v >= value) {
            return v;
        }
        while (v < value) {
            v <<= 1;
        }
        return v;
    }

    const std::size_t m_capacity;
    const std::size_t m_mask;
    std::vector<float> m_buffer;
    std::atomic<std::size_t> m_writeIndex;
    std::atomic<std::size_t> m_readIndex;
};

}  // namespace tine::dsp

#endif  // TINE_NATIVE_UTIL_FLOAT_RING_BUFFER_HPP
