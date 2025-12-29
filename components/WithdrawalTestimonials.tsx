import React, { useState, useEffect } from 'react';
import { instrumentedFetch } from '../services/apiService';
import { API_URL } from '../lib/apiConfig';

interface WithdrawalTestimonial {
    userName: string;
    phone: string;
    amount: number;
    date: string;
}

const WithdrawalTestimonials: React.FC = () => {
    const [testimonials, setTestimonials] = useState<WithdrawalTestimonial[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTestimonials();
    }, []);

    const generateFakeTestimonials = () => {
        const maleNames = ['Abdi', 'Mohamed', 'Ahmed', 'Hassan', 'Hussein', 'Farah', 'Ali', 'Omar', 'Ibrahim', 'Yusuf', 'Khalid', 'Mustafa', 'Jama', 'Guled', 'Liban'];
        const femaleNames = ['Asha', 'Fadumo', 'Maryam', 'Khadija', 'Hibo', 'Sahra', 'Hodan', 'Nasra', 'Safia', 'Leyla', 'Nimo', 'Ubah', 'Idil', 'Sagal', 'Hani'];
        const allNames = [...maleNames, ...femaleNames];

        const fakes: WithdrawalTestimonial[] = [];
        for (let i = 0; i < 50; i++) {
            const name = allNames[Math.floor(Math.random() * allNames.length)];
            const randomAmount = Math.floor(Math.random() * 110) + 1; // 1 to 110
            const randomPhoneSuffix = Math.floor(Math.random() * 900) + 100; // 3 digits
            // Format: 61*******123 or similar, user wants ** to appear
            const phone = `61*****${randomPhoneSuffix}`;

            fakes.push({
                userName: name,
                phone: phone,
                amount: randomAmount,
                date: new Date().toISOString()
            });
        }
        return fakes;
    };

    const fetchTestimonials = async () => {
        let allData: WithdrawalTestimonial[] = [];

        // Add fake data first to ensure we always have activity
        allData = generateFakeTestimonials();

        try {
            const url = `${API_URL}/public/withdrawals/testimonials?limit=30`;
            const { responseData } = await instrumentedFetch(url, {
                method: 'GET',
            });

            if (responseData.success && responseData.testimonials && responseData.testimonials.length > 0) {
                // If we have real data, mix it in or put it first
                // Ensure real data phones are also masked with ** style if not already
                const realData = responseData.testimonials.map((t: WithdrawalTestimonial) => ({
                    ...t,
                    // If phone comes as "252615552432", mask it to "61*****432"
                    phone: t.phone.replace(/^(?:252|0)?(6\d)(?:\d+)(\d{3})$/, '$1*****$2')
                }));

                allData = [...realData, ...allData];
            }
        } catch (error) {
            console.error('Failed to fetch testimonials, using generated data only:', error);
        } finally {
            // Duplicate array multiple times to ensure smooth marquee with enough content
            setTestimonials([...allData, ...allData, ...allData]);
            setLoading(false);
        }
    };

    if (loading || testimonials.length === 0) {
        return null;
    }

    return (
        <div className="w-full bg-green-900/10 border-y border-green-500/20 py-3 overflow-hidden backdrop-blur-sm mb-4 mt-20">
            <div className="relative flex overflow-x-hidden">
                <div className="animate-marquee whitespace-nowrap flex items-center gap-12">
                    {testimonials.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-green-800 font-medium">
                            <span className="text-lg">💰</span>
                            <span className="font-bold text-green-900">{t.userName}</span>
                            <span className="text-sm opacity-70">({t.phone})</span>
                            <span className="text-sm">wuxuu labaxay lacag dhan</span>
                            <span className="font-black text-green-700 bg-green-100 px-2 py-0.5 rounded-full border border-green-200">
                                ${t.amount.toFixed(2)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                .animate-marquee {
                    animation: marquee 180s linear infinite;
                }
                
                /* Pause on hover for readability */
                .animate-marquee:hover {
                    animation-play-state: paused;
                }

                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
            `}</style>
        </div>
    );
};

export default WithdrawalTestimonials;
