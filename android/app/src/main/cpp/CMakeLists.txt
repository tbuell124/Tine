cmake_minimum_required(VERSION 3.22.1)
project(pitchdetector)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

add_library(pitchdetector SHARED
    PitchDetector.cpp
    ../../../../src/native/dsp/YinPitchDetector.cpp
)

target_include_directories(pitchdetector PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../src/native/dsp
)

find_package(oboe REQUIRED CONFIG)

target_link_libraries(pitchdetector
    oboe::oboe
    log
)
